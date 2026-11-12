#!/usr/bin/env node
/**
 * Playwright smoke test (CLAUDE.md §5): boots server.js, loads the page in
 * headless Chromium, starts a run, holds movement + shoot keys for 10s,
 * asserts zero console errors, and saves a timestamped screenshot.
 * Room-transition coverage is added once floor/room-to-room transitions
 * exist (P1.2) — for now this exercises the single P0 room.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 8099; // avoid clobbering a dev server the user may have running on 8080
const URL = `http://localhost:${PORT}/`;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let resolved = false;
    proc.stdout.on('data', (chunk) => {
      if (!resolved && chunk.toString().includes('running at')) {
        resolved = true;
        resolve(proc);
      }
    });
    proc.stderr.on('data', (chunk) => process.stderr.write(chunk));
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (!resolved) reject(new Error(`server exited early with code ${code}`));
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(proc);
      }
    }, 3000);
  });
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('[smoke] starting dev server...');
  const server = await startServer();

  const consoleErrors = [];
  let browser;
  try {
    console.log('[smoke] launching headless Chromium...');
    browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    console.log(`[smoke] loading ${URL} ...`);
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(500); // let main.js boot (mod loading is async)

    console.log('[smoke] dismissing the main menu...');
    await page.keyboard.press('Space'); // menu -> playing (CLAUDE.md §1.9's "useActive" confirm action)
    await page.waitForTimeout(200);

    console.log('[smoke] holding movement + shoot keys for 10s...');
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(10000);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(SCREENSHOT_DIR, `smoke-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`[smoke] screenshot saved to ${screenshotPath}`);

    if (consoleErrors.length > 0) {
      console.error('[smoke] console errors detected:');
      for (const err of consoleErrors) console.error(`  - ${err}`);
      throw new Error(`${consoleErrors.length} console error(s) during smoke test`);
    }

    console.log('[smoke] PASSED: page loaded, ran for 10s, zero console errors.');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exitCode = 1;
});
