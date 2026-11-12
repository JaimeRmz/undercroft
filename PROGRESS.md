# PROGRESS.md — Task Queue (strict priority order)

Legend: `[ ]` todo · `[x]` done (verified) · `[!]` blocked (write why) · `[~]` in progress (only one at a time)
Rule: finish every task in a tier before starting the next one. Commit after every task.

## Session log
<!-- Each session appends one line: timestamp | tasks completed | gate status -->
2026-11-11 23:44 | session start, repo was empty (no .git) despite CLAUDE.md assuming history | starting P0.1

---

## P0 — Foundation + playable vertical slice (target: first ~2 hours)
- [x] P0.1 `git init`, folder layout, package.json (start/test/smoke/simulate scripts), server.js (static files + `/api/mods` + `/api/mods/hash` + guarded `/api/save` for editors), index.html
- [x] P0.2 Core: event bus, seeded RNG with named streams, math utils, fixed-timestep loop, config, logger, content registry. Unit tests.
- [x] P0.3 Engine: entities, world, tile grid collision (circle vs tiles), circle vs circle with spatial hash. Unit tests.
- [ ] P0.4 Mod loader v1 (manifest, load order, JSON loading, schema validation with readable errors) + `mods/core/` skeleton. Core content loads only through the loader. Tests incl. a deliberately broken test mod.
- [ ] P0.5 Input adapter (WASD move, arrow keys shoot, E bomb, Space active item, Q consumable, Ctrl drop trinket, Tab map, Esc pause, ` console) + gamepad support
- [ ] P0.6 Player controller with movement feel per CLAUDE.md §3, 4-way shooting, shots with arc/range/splash, stats pipeline implementing the exact damage and tears formulas (tested against the numbers)
- [ ] P0.7 Health system (red/soul/black, damage order, i-frames, death) + 3 basic enemies (chaser, erratic flier, turret shooter) defined in JSON
- [ ] P0.8 Single room: 13×7 tiles, rocks, pits, destructible blocks, doors that lock while enemies live and open on clear
- [ ] P0.9 Renderer: procedural sprites from JSON sprite specs, camera, hit flash, basic particles, decals. HUD hearts.
- [ ] P0.10 Headless simulate harness + Playwright smoke test working. **GATE P0: test + simulate + smoke all green, screenshot reviewed.**

## P1 — Core roguelike loop (a full run is possible)
- [ ] P1.1 Floor generation exactly per §3 + 1000-seed tests + minimap (visited/adjacent/special icons)
- [ ] P1.2 Room templates (ASCII JSON) for normal/treasure/shop/boss/secret/start; 30+ normal layouts across 2 chapters; room transitions (slide)
- [ ] P1.3 Pickups: coins (1/5/10), bombs (placed bombs: fuse, blast radius, destroy rocks, open secret walls, damage everything incl. player), keys, hearts (half/full/soul/black), batteries, chests (normal/locked), room clear rewards per formula
- [ ] P1.4 Item system v1: passive + active items with charges, item pools with weights and removal, pedestals, pickup banner, 30 items
- [ ] P1.5 Tear modifier system (all modifiers in §3 as composable components) + weapon types (normal, laser, charge shot, multishot) with priority + explicit synergy rules. Tests proving composition (homing+split, piercing+bounce, laser+homing, etc.)
- [ ] P1.6 Shop (priced items/pickups, sale signs), locked treasure/shop doors from floor 2, secret rooms (bomb the wall)
- [ ] P1.7 Enemy AI behavior library: all archetypes in §3, composable via JSON; 15 enemies; champions
- [ ] P1.8 Boss framework: phases, attack pattern library with telegraphs, HP bar; 4 bosses (2 chapters); boss item + trapdoor to next floor
- [ ] P1.9 4 floors (2 chapters) with palettes, pools, scaling; death screen with run stats; restart; main menu; pause menu
- [ ] P1.10 Game feel pass against §3 (accel/friction, hitstop, shake, knockback, splashes, head/body facing). **GATE P1 + bot completes 20 seeded floors without softlock.**

## P2 — Depth (what makes it feel like the reference)
- [ ] P2.1 Trinkets (one slot, swap by walking over a trinket), 15 trinkets
- [ ] P2.2 Cards/runes (consumable slot), 15 cards; pills with per-run random color mapping + identification, 15 pill effects
- [ ] P2.3 Status effects on enemies (poison/burn/slow/freeze/charm/fear/confuse) + boss status immunity
- [ ] P2.4 Familiars (orbitals, followers that shoot, blue-fly style helpers) as data-driven entities, 10 familiars
- [ ] P2.5 Transformations (set tags, 3 to transform, stacking), 5 transformations
- [ ] P2.6 Special rooms: challenge, curse, sacrifice, super secret, arcade (slot machine + fortune machine), devil/angel deal rooms with the chance formula
- [ ] P2.7 Characters: 5 original characters with distinct stats/starting items/mechanics (one with soul hearts only, one with a unique weapon, one that pays deals with coins), character select screen
- [ ] P2.8 Chapters 3–4 + a final chapter with a 3-phase final boss; 8 more bosses (12 total); 25 more enemies; item count to 80+
- [ ] P2.9 Save system: settings + persistent unlocks + mid-run save on room entry, "Continue" on the main menu; round-trip tests
- [ ] P2.10 Unlocks/achievements (data-driven conditions → unlock items/characters), stats page. **GATE P2.**

## P3 — Modding power + tools
- [ ] P3.1 Full mod scripting API (§4), override + `$patch`, dependency resolution, hot reload (console + polling)
- [ ] P3.2 `mods/example-mod/` demonstrating everything in §4; tests load it
- [ ] P3.3 Debug console: give, spawn, goto (room type), tp, stat, reset, seed, god, hitbox, collision, fps, log level, reload, unlockall, charge, heal, nextfloor + mod-registered commands; autocomplete for IDs
- [ ] P3.4 Debug overlays: hitboxes, collision grid, AI state labels, FPS/entity counts
- [ ] P3.5 editor.html: item editor + character editor + enemy editor (forms → live JSON preview → save to a mod through `/api/save`, schema validated) + room layout painter
- [ ] P3.6 Synth audio for every action + procedural music per chapter; mod audio files supported
- [ ] P3.7 Curses (darkness, lost, labyrinth/XL, unknown, maze), hard mode toggle, seeded runs from the menu, a challenge/game-mode example registered via the API
- [ ] P3.8 All docs complete and accurate (§7). **GATE P3.**

## P4 — Expansion (append freely; see CLAUDE.md §8)
- [ ] P4.1 Items to 150+, enemies to 40+, rooms to 100+, bosses to 12+
