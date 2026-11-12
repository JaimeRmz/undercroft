# DECISIONS.md — Log of autonomous decisions

Format: `YYYY-MM-DD | decision | reason`

---
2026-11-11 | Started repo from scratch; no prior git history existed despite CLAUDE.md assuming one | First real session; environment had only CLAUDE.md, PROGRESS.md, overnight scripts
2026-11-11 | Used git global identity (already configured) instead of setting a repo-local one | Avoid unnecessary config changes; global identity was present and valid
2026-11-11 | Project name in package.json: `undercroft` | Matches repo folder / game name
2026-11-11 | Server static file server has no external deps, implements its own MIME map and path traversal guard | CLAUDE.md mandates zero-dependency dev server
2026-11-11 | `/api/save` guarded to only write under `mods/` and only to `.json`/`.js` files, rejecting `..` path segments | Prevent arbitrary file write from the editor endpoint while still allowing mod authoring
2026-11-11 | `npm test` runs bare `node --test` (no explicit `tests/` path arg) | On this Windows/Git-Bash environment, passing an explicit directory arg to `node --test` fails with MODULE_NOT_FOUND (path mangling); bare `node --test` auto-discovers `**/*.test.{js,mjs,cjs}` and works correctly cross-platform
2026-11-12 | Shoot direction resolution: "last arrow key pressed wins, falling back to any other held shoot key on release" | Matches Isaac's 4-directional-only tears (no diagonals) without needing a more complex priority system; simplest rule that still feels responsive
2026-11-12 | PLAYER_BASE_SPEED_PX_PER_SEC=180, TEAR_BASE_SPEED_PX_PER_SEC=300, TEAR_ARC_HEIGHT=20, PLAYER_RADIUS=12, TEAR_RADIUS=6 | [assumed] no canonical px values exist since this is original art/engine; picked to feel proportionate to the 40px tile size and 13x7 room
2026-11-12 | P0.9 sprite specs (src/render/sprites.js SPRITES map) are inline JS objects, not yet loaded as .json files through the mod loader | Same plain-object shape a JSON file would parse into, so swapping to mod-loaded JSON later (editor.html in P3.5, mod art in P3) is a source-only change; not worth adding a "sprites" content kind to the loader until the editor/art pipeline actually needs it
