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

    // --- P2.10: lifetime stats screen, reachable from the menu -----------------------------
    {
      await page.keyboard.press('ControlLeft');
      await page.waitForTimeout(100);
      expect((await snap()).state === 'stats', 'Ctrl at the menu did not open the lifetime stats screen');
      await shot('stats-screen');
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
      expect((await snap()).state === 'menu', 'Space on the stats screen did not return to the menu');
    }

    console.log('[smoke] dismissing the main menu...');
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    expect((await snap()).state === 'characterSelect', 'did not reach character select after dismissing the menu');
    await shot('character-select');

    // --- P2.10: a locked character shows "???" and can't be confirmed into a run -----------
    {
      await page.keyboard.press('KeyD'); // moveRight: cycle off character-01 (always unlocked) onto a locked one
      await page.waitForTimeout(100);
      await shot('character-select-locked');
      await page.keyboard.press('Space'); // must be a no-op while locked
      await page.waitForTimeout(100);
      expect((await snap()).state === 'characterSelect', 'confirming a locked character started a run anyway');
      await page.keyboard.press('KeyA'); // moveLeft: back to character-01 for the rest of the script
      await page.waitForTimeout(100);
    }

    console.log('[smoke] confirming a character...');
    await page.keyboard.press('Space');
    await page.waitForTimeout(900); // enemy grace period + first frames
    expect(await playerPainted(), 'no player pixels in the start room');
    await shot('start-room');

    // --- P2.9: mid-run save (on room entry) + "Continue" survives a real page reload -----------
    {
      const beforeReload = await snap();
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__undercroft, null, { timeout: 15000 });
      await page.waitForTimeout(300);
      expect((await snap()).state === 'menu', 'expected the main menu right after a reload');
      await shot('menu-with-continue');
      await page.keyboard.press('KeyQ');
      await page.waitForTimeout(700); // re-stock the (freshly re-entered) current room + entry grace
      const afterContinue = await snap();
      expect(afterContinue.state === 'playing', 'pressing Q on the menu did not resume a saved run');
      expect(afterContinue.stage === beforeReload.stage, `continued run landed on stage ${afterContinue.stage}, expected ${beforeReload.stage}`);
      expect(afterContinue.cellKey === beforeReload.cellKey, `continued run landed in room ${afterContinue.cellKey}, expected ${beforeReload.cellKey}`);
      expect(await playerPainted(), 'no player pixels after continuing a saved run');
      await shot('continued-run');
    }

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

    // --- fairness: entry grace + readable enemy projectiles ---------------------------------------
    {
      const s0 = await snap();
      const normal = s0.floorCells.find((c) => c.type === 'normal');
      await page.evaluate((key) => {
        window.__undercroft.gotoCell(key);
        window.__undercroft.setHealth(6);
        window.__undercroft.setPlayer(120, 200);
        window.__undercroft.spawnEnemyAt('core:turret', 400, 120);
        window.__undercroft.spawnEnemyAt('core:chaser', 260, 200);
      }, normal.key);
      const a = await snap();
      await page.waitForTimeout(250);
      const b = await snap();
      expect(a.graceTimer > 0, 'no enemy grace period right after entering a room');
      expect(JSON.stringify(a.enemyPos) === JSON.stringify(b.enemyPos), 'enemies moved during the entry grace period');
      expect(b.hp === 6 && b.enemyShots === 0, 'player was attacked during the entry grace period');
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__undercroft.setHealth(6));
      expect((await snap()).enemyShots > 0 || (await snap()).enemies > 0, 'no enemy activity after grace');
      await shot('enemy-projectiles');
      await page.evaluate(() => window.__undercroft.killAllEnemies());
    }

    // --- P1.G1: a tear flies over a pit and kills an enemy on the far side -------------------------
    {
      const s0 = await snap();
      const normal = s0.floorCells.find((c) => c.type === 'normal');
      await page.evaluate((key) => {
        window.__undercroft.gotoCell(key);
        window.__undercroft.killAllEnemies();
        window.__undercroft.setHealth(6);
        // Clear the whole row first (the template's own obstacles may already occupy it),
        // then paint a clean 3-tile-wide pit directly between the player and the turret.
        for (let tx = 1; tx <= 11; tx++) window.__undercroft.setFloor(tx, 3);
        window.__undercroft.placePit(5, 3);
        window.__undercroft.placePit(6, 3);
        window.__undercroft.placePit(7, 3);
        window.__undercroft.setPlayer(100, 140); // tile (2,3) — left of the pit
        window.__undercroft.spawnEnemyAt('core:turret', 340, 140); // tile (8,3) — right of the pit, within shot range (6.5 tiles)
      }, normal.key);
      await page.waitForTimeout(250); // let the fresh spawn clear the entry-grace window
      await page.keyboard.down('ArrowRight');
      let killed = false;
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(100);
        await page.evaluate(() => window.__undercroft.setHealth(6));
        if ((await snap()).enemies === 0) {
          killed = true;
          break;
        }
        if (i === 2) await shot('tears-over-pit'); // grab the shot mid-fight, tear(s) visibly crossing the pit
      }
      await page.keyboard.up('ArrowRight');
      expect(killed, 'a tear aimed straight across a 3-tile pit never killed the turret on the far side');
    }

    // --- full HUD + boss fight, incl. P1.G6's attack telegraph -------------------------------------
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

        // P1.G6: every boss attack telegraphs 0.4s+ before it fires — catch one in the act and screenshot it.
        let telegraphed = false;
        for (let i = 0; i < 80 && !telegraphed; i++) {
          await page.waitForTimeout(100);
          await page.evaluate(() => window.__undercroft.setHealth(6));
          if ((await snap()).boss?.patternState === 'telegraph') telegraphed = true;
        }
        expect(telegraphed, 'boss never entered a telegraph state within 8s');
        if (telegraphed) await shot('boss-telegraph');

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

    // --- P2.4: familiars (orbital/hover/follower-shooter) actually render and persist across a door ---
    {
      const s0 = await snap();
      const normal = s0.floorCells.find((c) => c.type === 'normal');
      await page.evaluate((key) => {
        window.__undercroft.gotoCell(key);
        window.__undercroft.killAllEnemies();
        window.__undercroft.setHealth(6);
        window.__undercroft.giveFamiliars();
      }, normal.key);
      await page.waitForTimeout(400);
      expect((await snap()).familiars === 3, `expected 3 familiars, got ${(await snap()).familiars}`);
      await shot('familiars');
    }

    // --- P2.5: transformations (flight + costume ring) via collecting 3 real set-tagged items ---
    {
      await page.evaluate(() => window.__undercroft.killAllEnemies());
      const ok = await page.evaluate(() => window.__undercroft.triggerTransformation('core:transformation-01')); // Mothwing: grants flight
      expect(ok, 'triggerTransformation could not find 3 items carrying core:transformation-01\'s set tag');
      await page.waitForTimeout(100);
      const s = await snap();
      expect(s.transformations.includes('core:transformation-01'), 'Mothwing never activated after collecting its 3 set items');
      expect(s.flying, 'Mothwing should have granted flight');
      await shot('transformation');
    }

    // --- P2.6: special room art (sacrifice spike, arcade machines, devil item) ------------------
    {
      const s0 = await snap();
      const normal = s0.floorCells.find((c) => c.type === 'normal');
      await page.evaluate((key) => {
        window.__undercroft.gotoCell(key);
        window.__undercroft.killAllEnemies();
        window.__undercroft.setHealth(6);
        window.__undercroft.giveCoins(30);
        window.__undercroft.debugStockSpecial('sacrifice');
        window.__undercroft.debugStockSpecial('arcade');
        window.__undercroft.debugStockSpecial('devil');
      }, normal.key);
      await page.waitForTimeout(200);
      await shot('special-rooms');
    }

    // --- P1.G7: door open-flash pulse, right as a cleared room's doors swing open --------------
    {
      const s0 = await snap();
      const normal = s0.floorCells.find((c) => c.type === 'normal');
      await page.evaluate((key) => {
        window.__undercroft.gotoCell(key);
        window.__undercroft.resetRoomClear(); // this room may well have already been cleared earlier in this same test run
        window.__undercroft.setHealth(6);
        window.__undercroft.spawnEnemyAt('core:chaser', 200, 160);
      }, normal.key);
      await page.waitForTimeout(600); // clear the entry-grace window with the enemy still alive and the doors locked
      expect((await snap()).doors.some((d) => d.locked), 'doors should be locked while an enemy is alive');
      await page.evaluate(() => window.__undercroft.killAllEnemies());
      let pulsed = false;
      for (let i = 0; i < 10 && !pulsed; i++) {
        await page.waitForTimeout(30);
        if ((await snap()).doors.some((d) => d.animPulse !== null)) pulsed = true;
      }
      expect(pulsed, 'no door-flash pulse fired when the room cleared and its doors opened');
      if (pulsed) await shot('door-open-pulse');
    }

    // --- P1.G7: floor-descent fade (dev-triggered — a real trapdoor walk is exercised in P1.8's own tests) ---
    {
      await page.evaluate(() => window.__undercroft.killAllEnemies());
      const before = (await snap()).stage;
      await page.evaluate(() => window.__undercroft.triggerFloorTransition());
      await page.waitForTimeout(150); // mid fade-out (FLOOR_FADE_OUT_SECONDS = 0.35s)
      expect((await snap()).floorTransitioning, 'floor transition did not start');
      await shot('floor-transition-fade');
      let swapped = false;
      for (let i = 0; i < 30 && !swapped; i++) {
        await page.waitForTimeout(50);
        if (!(await snap()).floorTransitioning) swapped = true;
      }
      expect(swapped, 'floor transition never completed');
      expect((await snap()).stage === before + 1, 'advanceFloor did not run at the fade swap');
    }

    // --- P2.8: chapter 5 (final chapter) palette + the final boss -> victory screen ------------
    {
      await page.evaluate(() => window.__undercroft.jumpToStage(9));
      await page.waitForTimeout(200);
      let s = await snap();
      expect(s.stage === 9, 'jumpToStage(9) did not land on stage 9');
      await shot('chapter-5-floor');
      const bossCell = s.floorCells.find((c) => c.type === 'boss');
      expect(!!bossCell, 'stage 9 floor has no boss room');
      if (bossCell) {
        await page.evaluate((key) => window.__undercroft.gotoCell(key), bossCell.key);
        await page.waitForTimeout(700); // clear the entry-grace window so the boss is a real, visible threat
        s = await snap();
        expect(s.enemies > 0, 'no boss spawned in the stage-9 boss room');
        await shot('final-boss');
        const killed = await page.evaluate(() => window.__undercroft.killBoss());
        expect(killed, 'killBoss found no boss entity to kill');
        await page.waitForTimeout(200);
        expect((await snap()).state === 'victory', 'defeating the final boss and touching its trapdoor did not reach the victory screen');
        await shot('victory');
        await page.evaluate(() => window.__undercroft.forcePlaying());
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
