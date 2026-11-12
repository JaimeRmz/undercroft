# CLAUDE.md — Project Brief (read this first, every session)

You are building **UNDERCROFT**, a twin-stick roguelike shooter whose **mechanics, game feel, structure and depth faithfully replicate The Binding of Isaac: Afterbirth**, using **100% original names, art, characters, items, enemies, text and audio**.

You are running **unattended overnight**. Nobody will answer questions. You make every decision yourself, write it down, and keep building.

---

## 0. NON-NEGOTIABLE RULES

1. **Never stop to ask the user anything.** If something is ambiguous, pick the option most faithful to how Afterbirth plays, log the decision in `DECISIONS.md` (one line: date, decision, reason), and continue.
2. **Never end a session voluntarily while tasks remain.** When you finish a task, start the next one in `PROGRESS.md` immediately.
3. **Always keep a playable build.** After every task the game must still launch and play. Never commit a broken build. If a change breaks things and you can't fix it in ~20 minutes, `git revert` it, log it in `KNOWN_ISSUES.md`, and move on.
4. **Commit after every completed task**: `git add -A && git commit -m "P<tier>.<n>: <task>"`. Small commits, often.
5. **Update `PROGRESS.md` before every commit** (check the box, add notes). That file is how the next session knows where you are.
6. **Strict priority order.** Never start a task in tier N+1 while any task in tier N is unchecked. Exception: a task is truly blocked. Then mark it `[!]`, write why, and move on.
7. **Verify, don't assume.** A task is done only when its verification passes (tests green and/or the headless smoke test passes). "The code exists" is not done.
8. **Original IP only.** Mechanics, numbers and systems may match Afterbirth exactly (game mechanics aren't copyrightable). But **never** use Isaac's character names, item names, enemy or boss names, the story, sprites, sound files, music or any extracted game data. Invent your own names and art. Do not download or extract any game files.
9. **No placeholders in core systems.** Content can be thin early on; systems can't be fake.
10. **Don't gold-plate.** Gameplay comes first. No splash screens, credits or polish passes until P0–P2 are done.
11. **Visual verification is mandatory.** Passing tests ≠ working game. Any task that touches what the player sees ends with a Playwright screenshot that you read and judge as a first-time player would. If the player, threats, or HUD aren't clearly readable, the task isn't done.

---

## 1. RESUME PROTOCOL (start of every session)

1. Read `CLAUDE.md` (this file), `PROGRESS.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`.
2. Run `git status` and `git log --oneline -15`. If there are uncommitted changes from a crashed session, either finish that task or `git stash` it, then continue.
3. Run `npm test`. If anything fails, fixing it is your first task.
4. Find the first unchecked `[ ]` task in `PROGRESS.md` (in priority order) and do it.
5. If every task is checked, go to section 8 ("When the queue is empty").

---

## 2. TECH STACK (decided, do not revisit)

- **Plain JavaScript ES modules + HTML5 Canvas 2D.** No framework, no bundler, no TypeScript build step.
- **Node 18+** for a zero-dependency dev server (`server.js`) and tests (`node --test`).
- **Dev dependency allowed:** `playwright` only, for the headless browser smoke test. No other npm packages without a logged reason in DECISIONS.md.
- **Mods:** JSON for data definitions, plain JS modules for scripted behavior (dynamic `import()` with a cache-busting query, which gives hot reload). JS is chosen over Lua because it's native to the runtime, needs no dependency, and hot-reloads trivially. Document this in TECHNICAL_ARCHITECTURE.md.
- **Art:** procedural vector drawing on canvas (shapes, colors, eyes, outlines) driven by JSON "sprite specs". Mods may also supply PNG spritesheets.
- **Audio:** WebAudio synthesized SFX and simple procedural music. Mods may supply audio files.
- **Run:** `npm start` → `http://localhost:8080`. Tests: `npm test`. Smoke test: `npm run smoke`.

### Hard architectural rules
- **All game logic must run headless in Node** (no DOM/canvas in logic). Rendering, audio and input are adapters behind interfaces. This is what makes automated testing possible.
- **Event bus** (`events.emit/on`) connects systems. Systems never import each other's internals.
- **Content registry**: every item, enemy, boss, character, room, floor, pickup, card, pill effect, transformation and game mode is registered by ID from data. **The base game's content lives in `mods/core/`** and loads through the same mod loader as user mods. If the core content can't be expressed as a mod, the mod system is wrong; fix the system.
- **Seeded RNG everywhere** (separate streams per subsystem: floorgen, drops, items, AI). No `Math.random()` in game logic.
- **Fixed timestep 60 Hz** simulation, interpolated render.

### Folder layout
```
undercroft/
  CLAUDE.md PROGRESS.md DECISIONS.md KNOWN_ISSUES.md
  README.md GAME_DESIGN.md TECHNICAL_ARCHITECTURE.md RESEARCH.md
  MODDING_GUIDE.md ITEM_CREATION_GUIDE.md CHARACTER_CREATION_GUIDE.md
  ENEMY_CREATION_GUIDE.md DEVELOPMENT_ROADMAP.md
  index.html editor.html server.js package.json
  src/core/      events, rng, math, loop, registry, config, log
  src/engine/    world, entity, collision, physics, spatialhash
  src/systems/   player, stats, combat, projectiles, tearmods, items, effects,
                 synergies, transformations, pickups, consumables, familiars,
                 enemies, ai/, bosses, room, floorgen, transitions, shop,
                 deals, unlocks, save, gamemodes
  src/render/    renderer, sprites, camera, vfx, particles
  src/audio/     audio (synth + file playback)
  src/ui/        menus, hud, map, console, debugoverlay
  src/modding/   modloader, api, schema, hotreload
  mods/core/     mod.json, items/, characters/, enemies/, bosses/, rooms/, floors/, ...
  mods/example-mod/
  tests/
  tools/         smoke.mjs (Playwright), simulate.mjs (headless bot runs)
```

---

## 3. REFERENCE MECHANICS (pre-researched; use these, don't re-research)

These come from the community wiki (bindingofisaacrebirth.wiki.gg) and BorisTheBrave's write-up on Isaac's dungeon generation. Implement them as written. Where something is unverified, it's marked **[assumed]**; pick a sensible value and log it.

### Stats
- **Damage:** `dmg = baseDmg * charMult * sqrt(1 + 1.2 * totalDmgUps) + flatDmg`, then multiply by all damage multipliers. Base 3.5. Damage-ups get diminishing returns; multipliers don't.
- **Tears (Afterbirth formula):** with tears stat T:
  - T > 0: `delay = 16 - 6*sqrt(1 + 1.3*T)`, floored at 5 (the soft cap is reached around T ≈ 1.82)
  - T = 0: delay 10
  - -0.77 < T < 0: `delay = 16 - 6*sqrt(1 + 1.3*T) - 6*T`
  - T ≤ -0.77: `delay = 16 - 6*T`
  - Then apply direct tear-delay modifiers (these can break the cap, minimum delay 1).
  - Fire rate = `30 / (delay + 1)` shots per second, in 30 fps logic ticks. Our sim runs at 60 Hz, so convert.
- **Range, shot speed, speed, luck:** base range ~6.5 tiles of travel with a falling arc **[assumed]**, shot speed 1.0, speed 1.0 (cap 2.0, floor 0.1), luck 0.
- **Luck** scales proc chances. Typical item proc: `chance = base + luck * k`, clamped to 0–100%.

### Health
- Red heart containers (counted in halves), soul hearts and black hearts (a black heart deals room damage when it's lost). Max 12 hearts total.
- Damage removes soul/black hearts first (rightmost first), then red.
- **Invulnerability after a hit:** ~1 second with blinking **[assumed: 60 frames]**.
- Most enemy contact and projectile damage is half a heart. Chapter 4+ enemies deal a full heart.

### Rooms
- Room interior is **13×7 tiles**, with doors centered on each wall. Doors lock while enemies are alive, and clearing a room opens them.
- **Room clear reward:** `roll = rand() * clamp(luck, 0, 10) * 0.1 + rand()`. Results: < 0.22 nothing; 0.22–0.30 card/pill/trinket; then coin / heart / key / bomb bands; > 0.95 chest **[the middle band split is assumed: roughly equal]**.
- Clearing a room adds one charge to the active item.
- **Room types:** start, normal, treasure (item pedestal), shop, boss, secret (bomb a wall to enter), super secret, challenge (waves of enemies, only enterable at full health), curse (spiked door that hurts on entry and exit), sacrifice (spikes that pay out), arcade/vault, library **[optional, P3]**, devil/angel deal rooms (after the boss).
- Templates are hand-authored ASCII layouts in JSON with weights and difficulty ratings. Generation picks a template per room by type, floor and difficulty.

### Floor generation (the Isaac algorithm; do this exactly)
- 9×8 grid (column 0 kept empty), start room at a fixed central cell.
- Target room count: `min(20, randInt(0,1) + 5 + floor(stage * 10/3))`.
- BFS from the start using a queue. For each neighbor of the current cell: skip it if occupied; skip it if it already has more than one filled neighbor; stop when the target count is reached; skip on a 50% coin flip; otherwise fill it and queue it. A cell that adds no neighbors is a dead end and goes on the end-room list. Above 16 rooms, re-queue the start room periodically.
- **Reject and regenerate** if the room count is wrong or the boss room touches the start room.
- **Boss room** = the farthest dead end. Treasure, shop and other special rooms take the remaining dead ends. If there aren't enough, regenerate.
- **Secret room:** an empty cell touching 3 or more rooms and no dead ends. Loosen the criteria after 300 and then 600 attempts.
- **Super secret room:** an empty cell next to exactly one normal room, not adjacent to special rooms **[assumed]**.
- **Sacrifice room** chance about 1/7, or about 1/3 at full health. **Challenge room** not on floor 1, 50% on floor 2.
- XL floors and curses (labyrinth, darkness, lost, unknown, maze) are P3.

### Floors and progression
- Chapters with 2 floors each: 4 chapters plus a final chapter (original names), each with its own palette, enemy pool and boss pool. The final boss has multiple phases.
- Each floor: the boss room drops an item and opens a trapdoor to the next floor.
- **Deal rooms after the boss:** chance builds from +35% for taking no red-heart damage during the boss fight and +99% for none on the whole floor, and drops after seeing one recently (×0.25). Never on floor 1. Devil deals cost heart containers (or 3 soul hearts if you have no red containers). There's an angel variant.

### Items
- Types: **passive**, **active** (charge bar measured in rooms cleared, or timed charges), **trinkets** (one slot), **cards/runes** (a consumable slot), **pills**.
- **Pills:** at run start, each pill *color* is randomly assigned an effect for that run. The effect stays unidentified ("???") until first use, then it's known. About 13 colors in the pool.
- **Item pools:** treasure, shop, boss, secret, devil, angel, curse, plus mod-defined pools. Weighted. Taking or seeing an item removes it from (or down-weights it in) every pool.
- **Quality 0–4** on each item. It's used by a few modifiers and for balancing.
- **Transformations:** collecting 3 different items with the same set tag grants a transformation (flight, a costume and a special effect). Multiple transformations stack. Duplicates of one item count once.
- **Synergies emerge from composition.** Tear modifiers (homing, piercing, spectral, bouncing, splitting, exploding, boomerang, wiggle, orbit, poison, burn, slow, freeze, charm, fear, confuse, chain lightning) attach as independent components with hooks (`onSpawn`, `onUpdate`, `onHitEnemy`, `onHitWall`, `onExpire`). **Weapon types** (normal shots, laser beam, charge shot, multishot spread, bombs-as-shots, melee) override the base attack by priority, and modifiers still apply to them. **Explicit synergy rules** (JSON: when items A and B are both held → extra effect or override) handle the special cases.
- **Status effects on enemies:** poison, burn, slow, freeze, charm, fear, confusion. Bosses get ~8 seconds of status immunity after being afflicted.

### Enemies
- Archetypes to build as composable behaviors: wander, chase, erratic flier, hop/leap, dash charger (charges along a cardinal line when aligned with the player), turret shooter, fleeing spawner, hide-and-pop shooter, burrower, front-armored knight, 4-direction bouncer, wall-phasing ghost, exploder, splitter, orbiter, mirror-of-player.
- **Champion variants:** base chance about 5%. Effects include ×2.6 HP, faster, explodes on death, splits on death, invulnerable until the other enemies die, drops coins when it hits you, and so on. Champions drop a pickup matching their color.

### Bosses
- Data-driven **phases** (at HP thresholds) → each phase has a weighted list of **attack patterns** with **telegraphs** (a wind-up animation or flash before the attack). Pattern library: aimed burst, ring, spiral, spread, charge, jump/slam with a shockwave ring, summon minions, teleport, telegraphed laser, projectile rain.
- Boss HP scales with floor. At least 2 bosses per chapter plus a multi-phase final boss.

### Game feel (this is a P1 priority, not polish)
- Movement: snappy acceleration (~3–4 frames to full speed), quick friction stop, diagonal speed normalized.
- Shooting: the 4 shooting directions are independent of movement. Shots inherit a bit of the player's velocity **[assumed: 30%]**. Shots fly in a slight arc, drop at end of range, and splash on impact.
- Hit feedback: enemies flash white for 2 frames, knockback, ~2-frame hitstop on heavy hits, small screen shake on player damage and explosions, blood/goo decals that persist in the room, death bursts of particles.
- The head turns toward the shooting direction, the body faces the movement direction.
- Room transitions slide ~0.25 seconds in the direction traveled.
- HUD: hearts top-left, coins/bombs/keys counts, active item with charge bar, trinket, consumable slot, minimap top-right, floor name on entry, item pickup banner (name + flavor line).

---

## 4. MOD SYSTEM REQUIREMENTS
- `mods/<id>/mod.json`: id, name, version, author, loadOrder, dependencies, enabled.
- The loader scans `mods/` (the dev server provides `/api/mods`), loads in order, and **validates every definition against a schema with readable errors** (file + field + problem). A bad mod gets disabled and logged; it never crashes the game.
- Definition files can hold one object or an array. Later mods can **override** an earlier definition by ID or **patch** it (`"$patch": true`).
- Scripts: `export default function(api) {...}`. The API includes `events.on`, `registerTearModifier`, `registerEffectAction`, `registerCondition`, `registerAIBehavior`, `registerBossPattern`, `registerWeapon`, `registerConsoleCommand`, `registerGameMode`, `registerRoomType`, plus read access to `game` and spawn helpers.
- **Hot reload:** the debug console `reload` command, plus an optional file watcher. The dev server reports a mods mtime hash and the client polls it in dev mode. Reload re-registers definitions; the player's live items pick up the new definitions.
- `mods/example-mod/` must demonstrate: a new item via JSON only, an item with a JS script, a new enemy with a custom AI behavior, a new character, a new room layout, a synergy rule and a custom console command.

---

## 5. VERIFICATION GATES
- `npm test`: unit tests for rng determinism, the stats formulas (match the numbers in section 3), damage/health order, collision, floor gen (**1000 seeds: connected, correct count, boss not adjacent to start, every special room reachable**), item pool removal, pill mapping per seed, synergy composition, save/load round trip, and mod validation (good and bad mods).
- `tools/simulate.mjs`: headless runs. (a) Every enemy and boss, spawned one at a time with a dummy player for 1200 frames: no exceptions, no NaN positions, bosses go through all their phases when given damage. (b) "Kitchen sink": give the player **every item at once** and simulate 3000 frames of combat: no exceptions, frame time under budget. (c) A bot plays 20 seeded floors (walk to rooms, shoot nearest enemy, take items) to check that runs can be completed and progression doesn't get stuck.
- `npm run smoke` (Playwright, headless Chromium): loads the page, starts a run, holds movement and shoot keys for 10 seconds, enters a room transition, and asserts **zero console errors**. It saves a screenshot to `tools/screenshots/` with a timestamp. **Look at the screenshot** (read the image) at least once per tier to check that it actually renders sensibly.
- Each tier ends with all three gates green. Record the results in PROGRESS.md.

---

## 6. CODE QUALITY
- Small files with one responsibility. JSDoc on public APIs. No 2000-line god files.
- Constants and tunables live in `src/core/config.js` or in data, not magic numbers scattered around the code.
- Every system exposes `init`, `update(dt)`, `serialize`, `deserialize` where it makes sense.
- Performance budget: 60 fps with 40 enemies + 300 projectiles + particles. Use a spatial hash and object pools for projectiles and particles.

---

## 7. DOCUMENTATION
Keep these current, and update the relevant doc in the same commit as the code: README.md (how to run, controls, features), GAME_DESIGN.md, TECHNICAL_ARCHITECTURE.md, RESEARCH.md (copy section 3 and expand it, separating **verified** from **assumed**), MODDING_GUIDE.md, ITEM_CREATION_GUIDE.md, CHARACTER_CREATION_GUIDE.md, ENEMY_CREATION_GUIDE.md, DEVELOPMENT_ROADMAP.md, KNOWN_ISSUES.md, DECISIONS.md.

---

## 8. WHEN THE QUEUE IS EMPTY
Never idle. In order:
1. Fix anything in KNOWN_ISSUES.md.
2. Add content: more items (aim for 150+ total), enemies (40+), room layouts (100+), bosses (12+), cards, pills, trinkets. Every one must be exercised by the simulate gate.
3. Improve game feel against section 3.
4. Append new tasks to PROGRESS.md under "P4 — Expansion" and keep going.

If you find a `STOP` file in the repo root, commit your work and end the session.
