# DECISIONS.md — Log of autonomous decisions

Format: `YYYY-MM-DD | decision | reason`

---
2026-11-11 | Started repo from scratch; no prior git history existed despite CLAUDE.md assuming one | First real session; environment had only CLAUDE.md, PROGRESS.md, overnight scripts
2026-11-11 | Used git global identity (already configured) instead of setting a repo-local one | Avoid unnecessary config changes; global identity was present and valid
2026-11-11 | Project name in package.json: `undercroft` | Matches repo folder / game name
2026-11-11 | Server static file server has no external deps, implements its own MIME map and path traversal guard | CLAUDE.md mandates zero-dependency dev server
2026-11-11 | `/api/save` guarded to only write under `mods/` and only to `.json`/`.js` files, rejecting `..` path segments | Prevent arbitrary file write from the editor endpoint while still allowing mod authoring
2026-11-11 | `npm test` runs bare `node --test` (no explicit `tests/` path arg) | On this Windows/Git-Bash environment, passing an explicit directory arg to `node --test` fails with MODULE_NOT_FOUND (path mangling); bare `node --test` auto-discovers `**/*.test.{js,mjs,cjs}` and works correctly cross-platform
