# KNOWN_ISSUES.md

Format: one entry per issue. State, impact, and whether it blocks a gate.

---
- Locked vs. open doors render with the same brown tile color (no visual distinction). Cosmetic only; doesn't block the P0 gate. Revisit in P1.2 (room templates/transitions) or the P1.10 game-feel pass.
- `tools/simulate.mjs` currently covers a P0-scoped subset of CLAUDE.md §5 (a)/(b)/(c): the 3 existing enemies alone, a kitchen-sink combat scenario, and a bot clearing 20 seeded single-room encounters. Full scope (every boss through its phases, every item at once, 20 seeded full floor runs) needs bosses (P1.8), items (P1.4), and floor generation (P1.1) to exist first — expand simulate.mjs as each lands.
- Wall tiles (`#15151a`) are close in value to the page/canvas background (`#0a0a0d`/`#111`), making room boundaries low-contrast. Cosmetic; fine for the P0 vertical slice, worth revisiting in the P1.10 game-feel pass.
