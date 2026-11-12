#!/usr/bin/env node
/**
 * Playwright smoke test (CLAUDE.md §5): boots server.js, loads the page in
 * headless Chromium (1920x1080), starts a run, holds movement + shoot keys,
 * then walks through 4+ REAL doors (checking after every one that the player
 * is actually painted on the canvas), visits a shop, dies, and saves
 * screenshots (menu, start room, combat, after transitions, shop, death) to
 * tools/screenshots/ for visual review. Zero console errors is required.
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
const SIDE_KEY = { north: 'KeyW', south: 'KeyS', east: 'KeyD', west: 'KeyA' };
const SIDE_DELTA = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

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
  const failures = [];
  const shots = [];
  let browser;
  try {
    console.log('[smoke] launching headless Chromium (1920x1080)...');
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shot = async (name) => {
      const file = path.join(SCREENSHOT_DIR, `smoke-${stamp}-${name}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
      console.log(`[smoke] screenshot: ${file}`);
    };
    const snap = () => page.evaluate(() => window.__undercroft.snapshot());
    const expect = (cond, msg) => {
      if (!cond) {
        failures.push(msg);
        console.error(`[smoke] CHECK FAILED: ${msg}`);
      }
    };
    /** Samples the canvas where the player should be drawn; true if bright player-body pixels are there. */
    const playerPainted = () =>
      page.evaluate(() => {
        const s = window.__undercroft.snapshot();
        if (!s.playerPixel) return false;
        const ctx = document.getElementById('game').getContext('2d');
        const px = ctx.getImageData(Math.round(s.playerPixel.x), Math.round(s.playerPixel.y), 1, 1).data;
        // Player body #e8d9b0 / belly #f5ecd2 / hit-flash white are bright and warm; floor and walls are dark.
        return px[0] > 150 && px[1] > 140 && px[2] > 100;
      });

    console.log(`[smoke] loading ${URL} ...`);
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__undercroft, null, { timeout: 15000 }); // main.js boot (mod loading is async)
    await page.waitForTimeout(300);

    await shot('menu');
    console.log('[smoke] dismissing the main menu...');
    await page.keyboard.press('Space');
    await page.waitForTimeout(900); // enemy grace period + first frames
    expect(await playerPainted(), 'no player pixels in the start room');
    await shot('start-room');

    // Resize handling: integer scale (canvas = 640*k x 360*k), letterboxed inside the window, still painting.
    for (const [w, h, k] of [[1366, 768, 2], [2560, 1440, 4], [1920, 1080, 3]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      const dims = await page.evaluate(() => {
        const c = document.getElementById('game');
        const r = c.getBoundingClientRect();
        return { bw: c.width, bh: c.height, cw: Math.round(r.width), ch: Math.round(r.height) };
      });
      expect(dims.bw === 640 * k && dims.bh === 360 * k && dims.cw === 640 * k && dims.ch === 360 * k, `at ${w}x${h} expected a ${640 * k}x${360 * k} canvas, got ${JSON.stringify(dims)}`);
      expect(await playerPainted(), `no player pixels after resizing to ${w}x${h}`);
      if (w === 1366) await shot('resized-1366x768');
    }

    console.log('[smoke] holding movement + shoot keys for 6s...');
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(6000);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(200);
    if ((await snap()).state === 'dead') {
      await page.keyboard.press('Space');
      await page.waitForTimeout(400);
    }

    // --- walk through >= 4 real doors ---------------------------------------------------------
    const visited = new Set();
    let transitions = 0;
    let combatShot = false;
    for (let guard = 0; guard < 14 && transitions < 4; guard++) {
      let s = await snap();
      visited.add(s.cellKey);
      await page.evaluate(() => window.__undercroft.setHealth(6));

      if (!combatShot && s.enemies > 0 && s.cellType === 'normal') {
        console.log('[smoke] fighting in a normal room...');
        await page.waitForTimeout(800); // enemy grace period
        await page.keyboard.down('ArrowRight');
        await page.keyboard.down('KeyA');
        await page.waitForTimeout(1800);
        await page.keyboard.up('KeyA');
        await page.keyboard.up('ArrowRight');
        await page.evaluate(() => window.__undercroft.setHealth(6));
        await shot('combat');
        combatShot = true;
      }

      await page.evaluate(() => window.__undercroft.killAllEnemies());
      await page.waitForTimeout(250);
      s = await snap();

      const cells = new Map(s.floorCells.map((c) => [c.key, c.type]));
      const options = s.doors
        .filter((d) => !d.keyLocked)
        .map((d) => {
          const [x, y] = s.cellKey.split(',').map(Number);
          const [dx, dy] = SIDE_DELTA[d.side];
          const key = `${x + dx},${y + dy}`;
          return { ...d, key, type: cells.get(key) };
        })
        .filter((d) => d.type && d.type !== 'boss' && d.type !== 'secret' && d.type !== 'supersecret');
      options.sort((a, b) => Number(visited.has(a.key)) - Number(visited.has(b.key)));
      const door = options[0];
      if (!door) break;

      // Stand 2 tiles inside the door, hold the direction key until the cell changes.
      const [dx, dy] = SIDE_DELTA[door.side];
      await page.evaluate(
        ({ tx, ty, dx, dy }) => window.__undercroft.setPlayer((tx - dx * 2 + 0.5) * 40, (ty - dy * 2 + 0.5) * 40),
        { tx: door.tx, ty: door.ty, dx, dy }
      );
      await page.keyboard.down(SIDE_KEY[door.side]);
      const before = s.cellKey;
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(100);
        if ((await snap()).cellKey !== before) break;
      }
      await page.keyboard.up(SIDE_KEY[door.side]);
      await page.waitForTimeout(600); // transition + entry
      s = await snap();
      if (s.cellKey === before) {
        console.warn(`[smoke] did not get through the ${door.side} door; trying another`);
        continue;
      }
      transitions++;
      console.log(`[smoke] transition ${transitions}: went ${door.side} into ${s.cellKey} (${s.cellType}), enemies=${s.enemies}`);
      expect(s.player.inWorld, `player missing from the room world after transition ${transitions}`);
      expect(await playerPainted(), `no player pixels at the player's screen position after transition ${transitions}`);
      if (transitions === 1) await shot('after-transition-1');
    }
    expect(transitions >= 4, `only completed ${transitions} door transitions (need 4)`);
    await shot('after-4-transitions');

    // --- full HUD + boss fight --------------------------------------------------------------------
    {
      await page.evaluate(() => window.__undercroft.giveLoadout());
      const s = await snap();
      const boss = s.floorCells.find((c) => c.type === 'boss');
      if (boss) {
        await page.evaluate((key) => {
          window.__undercroft.gotoCell(key);
          window.__undercroft.setHealth(6);
        }, boss.key);
        await page.evaluate(() => window.__undercroft.setPlayer(120, 200)); // gotoCell drops the player at room center, on top of the boss
        await page.waitForTimeout(1800);
        await page.evaluate(() => window.__undercroft.setHealth(6));
        expect((await snap()).enemies > 0, 'boss room has no boss');
        await shot('boss-and-hud');
        await page.evaluate(() => window.__undercroft.killAllEnemies());
      } else {
        await shot('hud-full');
      }
    }

    // --- shop ----------------------------------------------------------------------------------
    {
      const s = await snap();
      const shop = s.floorCells.find((c) => c.type === 'shop');
      if (shop) {
        await page.evaluate((key) => {
          window.__undercroft.gotoCell(key);
          window.__undercroft.giveCoins(30);
        }, shop.key);
        await page.waitForTimeout(500);
        expect(await playerPainted(), 'no player pixels in the shop');
        await shot('shop');
      } else {
        console.warn('[smoke] no shop on this floor; skipping shop screenshot');
      }
    }

    // --- death ---------------------------------------------------------------------------------
    {
      const s = await snap();
      const normal = s.floorCells.find((c) => c.type === 'normal');
      if (normal) await page.evaluate((key) => window.__undercroft.gotoCell(key), normal.key);
      await page.evaluate(() => window.__undercroft.killAllEnemies());
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        window.__undercroft.setHealth(1);
        window.__undercroft.spawnEnemyOnPlayer('core:chaser');
      });
      for (let i = 0; i < 50; i++) {
        await page.waitForTimeout(100);
        if ((await snap()).state === 'dead') break;
      }
      expect((await snap()).state === 'dead', 'player did not die when overlapped by an enemy at 1 half-heart');
      await page.waitForTimeout(300);
      await shot('death');
    }

    if (consoleErrors.length > 0) {
      console.error('[smoke] console errors detected:');
      for (const err of consoleErrors) console.error(`  - ${err}`);
      throw new Error(`${consoleErrors.length} console error(s) during smoke test`);
    }
    if (failures.length > 0) throw new Error(`${failures.length} smoke check(s) failed:\n  - ${failures.join('\n  - ')}`);

    console.log(`[smoke] PASSED: ${transitions} door transitions, ${shots.length} screenshots, zero console errors.`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exitCode = 1;
});
