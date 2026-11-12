# PROGRESS.md — Task Queue (strict priority order)

Legend: `[ ]` todo · `[x]` done (verified) · `[!]` blocked (write why) · `[~]` in progress (only one at a time)
Rule: finish every task in a tier before starting the next one. Commit after every task.

## Session log
<!-- Each session appends one line: timestamp | tasks completed | gate status -->
2026-11-11 23:44 | session start, repo was empty (no .git) despite CLAUDE.md assuming history | starting P0.1
2026-11-12 06:12 | completed P0.1-P0.10 | GATE P0 PASSED: `npm test` 159/159 green, `npm run simulate` all 3 checks pass (3 enemies alone x1200f, kitchen-sink 3000f @ ~0.004ms/frame, bot clears 20/20 seeded rooms without softlock), `npm run smoke` zero console errors + screenshot reviewed (camera/room/HUD/player all render correctly)
2026-11-12 | resumed session found an uncommitted, crashed P1.5 attempt (tearModifiers.js/weapons.js/synergies.js + a failing test); fixed the spectral-modifier bug, wired synergies into main.js (was implemented but never called), added the missing chargeShot weapon type, and added test coverage for weapons/synergies | completed P1.5; `npm test` 258/258 green, `npm run simulate` + `npm run smoke` both green, screenshot reviewed
2026-11-12 | added src/systems/shop.js (priced item/pickup slots, one sale slot per shop room) + key-locked treasure/shop doors from floor 2 on (Room.setDoorKeyLocked, transitions.resolveKeyLockedDoors, FloorRuntime._lockKeyDoors) | completed P1.6; `npm test` 270/270 green, `npm run simulate` + `npm run smoke` both green, screenshot reviewed (no shop room in that seeded run, but shop logic has full unit coverage)
2026-11-12 | added src/systems/ai/behaviors.js (composable AI behavior registry, all 16 §3 archetypes) + champions (rollChampion, shared applyEnemyDamage/killEnemy/isEnemyDamageBlocked pipeline every damage source now funnels through) + 13 new enemies (16 total) | completed P1.7; found and fixed 3 real bugs along the way (fleeingSpawner spawning minions forever, mirrorOfPlayer being permanently uncatchable by copying player velocity exactly, orbiter orbiting the player instead of a fixed anchor so it could never be cornered) plus a test-harness bug (tools/simulate.mjs's bot froze movement by total distance instead of per-axis alignment, and could spawn enemies into the room's border wall). `npm test` 292/292 green, `npm run simulate` (16 enemies solo + kitchen-sink + 20-seed bot) + `npm run smoke` both green, screenshot reviewed
2026-11-12 | added src/systems/bosses.js (phase resolution + bossAI state machine: cooldown->telegraph->executing->cooldown) + src/systems/ai/bossPatterns.js (all 10 §3 attack patterns) + src/ui/bossbar.js (HP bar) + 4 bosses (2 per chapter, one 3-phase) + boss item drop/trapdoor/floor-advance wiring in main.js | completed P1.8; bosses are spawned as regular 'enemy' entities (isBoss:true) so combat/room-clear-locking/hit-flash all reuse existing systems — only the pattern state machine is boss-specific. `npm test` 310/310 green, `npm run simulate` (added a (a2) check: every boss alone for 1200 frames under steady damage, asserts every phase is reached) + `npm run smoke` both green, screenshot reviewed (start room, no boss in frame — HP bar/trapdoor logic has full unit coverage instead)
2026-11-12 | rewrote src/main.js around a `gameState` ('menu'/'playing'/'paused'/'dead') + a rebuildable `run` object (createRun/advanceFloor) so restarting is just calling createRun() again, not reloading the page; added src/ui/screens.js (menu/pause/death overlays), tagged all 16 enemies + both chapters' content with `chapter` (1 or 2) for per-chapter pools, added a 2-chapter tile palette to renderer.js | completed P1.9; floors beyond stage 4 keep working by falling back to chapter 1/2 content (the existing chapter-pool fallback-to-"all" logic), so nothing hard-stops at floor 4 pending P2.8's real chapter 3+ content. Fixed smoke.mjs, which would otherwise now just sit on the new menu screen for its whole 10s (added a Space press to dismiss it first). `npm test` 312/312 green, `npm run simulate` + `npm run smoke` both green; manually verified the menu and pause overlays render correctly via a one-off Playwright screenshot (death screen reviewed by code inspection only — forcing an actual in-browser death wasn't practical to script quickly)
2026-11-12 | resumed session found an uncommitted, crashed P1.10 attempt (hitstop.js, knockback, head/body sprite facing, plus a big tools/simulate.mjs rewrite adding a (d) "bot plays a full seeded floor" check); finished it, and in the process found and fixed two real bugs the new (d) check surfaced: the `splitPits` room template's two pit columns spanned every interior row including the door row, fully bisecting the room with no passage (fixed in tools/gen-room-templates.mjs + regenerated normal-11/normal-27.json), and tools/simulate.mjs's bot chased enemies via raw dx/dy with no obstacle avoidance, so an enemy on the far side of any wall/pit obstacle could wedge the bot against it forever (fixed by routing combat approach through the same bfsTilePath used for door-travel) | completed P1.10; GATE P1 PASSED: `npm test` 322/322 green, `npm run simulate` all checks green including the new 20-seeded-full-floor bot run (no softlocks; most seeds end in the bot dying rather than winning, which is expected and acceptable since this simple bot never dodges — the gate is softlock-freedom, not survival), `npm run smoke` zero console errors + screenshot reviewed. Deleted leftover scratch debug scripts (tools/debug_sim*.mjs) from the crashed session that were superseded by the finished simulate.mjs work
2026-11-12 | added src/systems/trinkets.js (one-slot equip/unequip/drop/swap, reversible small stat-delta effects) + 15 trinkets (tools/gen-trinkets.mjs) + a minimal HUD trinket-slot indicator (src/ui/trinketSlot.js); wired into main.js (dropTrinket input, room-clear/chest "trinket" reward category which was previously a no-op) and tools/simulate.mjs | completed P2.1; `npm test` 330/330 green, `npm run simulate` + `npm run smoke` both green, screenshot reviewed (empty trinket slot visible top-left; no trinket drop occurred in that seeded 10s run, but pickup/swap/drop logic has full unit coverage)
2026-11-12 | factored the items.js/trinkets.js duplicate stat-delta applier into src/systems/statEffects.js, then added src/systems/effects.js (shared one-shot effect dispatcher: heal/healFull/damage/soulHeart/blackHeart/statPermanent/statTemporary/coins/bombs/keys/mapReveal/teleport/nova/devilTrade), src/systems/cards.js (15 cards, tools/gen-cards.mjs) and src/systems/pills.js (per-run color->effect shuffle + identification, 15 effects, tools/gen-pills.mjs), src/systems/consumables.js (the single consumable slot: fills only when empty, 'Q' fires and clears it), + health.js's new removeRedContainer (used by the one risk/reward card and future devil deals); added matching HUD indicator (src/ui/consumableSlot.js) | completed P2.2; `npm test` 353/353 green, `npm run simulate` + `npm run smoke` both green, screenshot reviewed (trinket + consumable slots both visible). Cards are named "Rune of <word>", deliberately not the real tarot-deck names Isaac's cards use (The Fool/The Magician/etc. are themselves Isaac's actual item names, which CLAUDE.md §0 forbids reusing)
2026-11-12 | added src/systems/statusEffects.js (duration/DOT/movement-override simulation + boss immunity for poison/burn/slow/freeze/charm/fear/confuse) wired into enemies.js's updateEnemies (tick status -> apply DOT via the existing applyEnemyDamage -> skip AI if frozen -> run AI -> apply confuse/fear/charm/slow movement override) and combat.js (charm: no player contact damage, charmed-vs-other-enemy contact damage on a cooldown); tearModifiers.js's 7 status-tag modifiers now call applyStatus() instead of stamping a bare timestamp. Added 7 new items (tools/gen-items.mjs, item-31..37) that grant one status modifier each via a new `grantsTearModifier` item field, so every status is actually reachable in a real run, not just exercisable by tests | completed P2.3; `npm test` 364/364 green, `npm run simulate` + `npm run smoke` both green, screenshot reviewed

---

## P0 — Foundation + playable vertical slice (target: first ~2 hours)
- [x] P0.1 `git init`, folder layout, package.json (start/test/smoke/simulate scripts), server.js (static files + `/api/mods` + `/api/mods/hash` + guarded `/api/save` for editors), index.html
- [x] P0.2 Core: event bus, seeded RNG with named streams, math utils, fixed-timestep loop, config, logger, content registry. Unit tests.
- [x] P0.3 Engine: entities, world, tile grid collision (circle vs tiles), circle vs circle with spatial hash. Unit tests.
- [x] P0.4 Mod loader v1 (manifest, load order, JSON loading, schema validation with readable errors) + `mods/core/` skeleton. Core content loads only through the loader. Tests incl. a deliberately broken test mod.
- [x] P0.5 Input adapter (WASD move, arrow keys shoot, E bomb, Space active item, Q consumable, Ctrl drop trinket, Tab map, Esc pause, ` console) + gamepad support
- [x] P0.6 Player controller with movement feel per CLAUDE.md §3, 4-way shooting, shots with arc/range/splash, stats pipeline implementing the exact damage and tears formulas (tested against the numbers)
- [x] P0.7 Health system (red/soul/black, damage order, i-frames, death) + 3 basic enemies (chaser, erratic flier, turret shooter) defined in JSON
- [x] P0.8 Single room: 13×7 tiles, rocks, pits, destructible blocks, doors that lock while enemies live and open on clear
- [x] P0.9 Renderer: procedural sprites from JSON sprite specs, camera, hit flash, basic particles, decals. HUD hearts.
- [x] P0.10 Headless simulate harness + Playwright smoke test working. **GATE P0: test + simulate + smoke all green, screenshot reviewed.** ✅ PASSED 2026-11-12

## P1 — Core roguelike loop (a full run is possible)
- [x] P1.1 Floor generation exactly per §3 + 1000-seed tests + minimap (visited/adjacent/special icons)
- [x] P1.2 Room templates (ASCII JSON) for normal/treasure/shop/boss/secret/start; 30+ normal layouts across 2 chapters; room transitions (slide)
- [x] P1.3 Pickups: coins (1/5/10), bombs (placed bombs: fuse, blast radius, destroy rocks, open secret walls, damage everything incl. player), keys, hearts (half/full/soul/black), batteries, chests (normal/locked), room clear rewards per formula
- [x] P1.4 Item system v1: passive + active items with charges, item pools with weights and removal, pedestals, pickup banner, 30 items
- [x] P1.5 Tear modifier system (all modifiers in §3 as composable components) + weapon types (normal, laser, charge shot, multishot, bombs-as-shots, melee) with priority + explicit synergy rules. Tests proving composition (homing+split, piercing+bounce, laser+homing, etc.)
- [x] P1.6 Shop (priced items/pickups, sale signs), locked treasure/shop doors from floor 2, secret rooms (bomb the wall — already done in P1.3)
- [x] P1.7 Enemy AI behavior library: all archetypes in §3, composable via JSON; 15 enemies; champions
- [x] P1.8 Boss framework: phases, attack pattern library with telegraphs, HP bar; 4 bosses (2 chapters); boss item + trapdoor to next floor
- [x] P1.9 4 floors (2 chapters) with palettes, pools, scaling; death screen with run stats; restart; main menu; pause menu
- [x] P1.10 Game feel pass against §3 (accel/friction, hitstop, shake, knockback, splashes, head/body facing). **GATE P1 + bot completes 20 seeded floors without softlock.** ✅ PASSED 2026-11-12

## P1.F — Playtest fixes (user playtest, 2026-11-12; do these before any P2 work)
- [x] P1.F1 Player (and 13 of 16 enemies + all bosses) invisible. Root causes: (1) the player entity lived only in room 1's World, so after any door `renderRoom` (which finds the player via `room.world`) never drew it — fixed by `placePlayerInRoom` re-homing the entity on every room change; (2) `SPRITES` only had specs for 3 enemies, so every other enemy/boss was silently skipped — fixed with generated specs (`resolveEnemySpec`); (3) trinket/card/pill pickups had no draw code. Tests: `systems-roomEntry` (10+ transitions, all 4 directions), `render-audit` (every entity type draws).
- [x] P1.F2 Room is small and off-center: fixed 640x360 logical view, room centered (520x280, camera locked), integer-scaled + letterboxed + resize-aware (render/viewport.js, ui/layout.js zones keep HUD in the margins). Smoke checks 3 window sizes and screenshots them.
- [x] P1.F3 Full HUD: coin/bomb/key counters with icons, stats column (DMG/TEARS/SPEED/RANGE/SHOT/LUCK), active item + segmented charge bar, trinket + card/pill slots, floor-name banner (new mods/core/floors data), boss HP bar. Pure model in ui/hudModel.js, drawing in ui/hudPanels.js; test asserts nothing draws over the play area.
- [ ] P1.F4 Fairness: ~0.5s enemy grace on room entry, blinking i-frames, high-contrast enemy projectiles, "Killed by <enemy>" on death screen

---

## P2 — Depth (what makes it feel like the reference)
- [x] P2.1 Trinkets (one slot, swap by walking over a trinket), 15 trinkets
- [x] P2.2 Cards/runes (consumable slot), 15 cards; pills with per-run random color mapping + identification, 15 pill effects
- [x] P2.3 Status effects on enemies (poison/burn/slow/freeze/charm/fear/confuse) + boss status immunity
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
