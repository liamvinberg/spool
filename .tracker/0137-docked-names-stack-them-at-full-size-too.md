# #137 · Docked names: stack them at full size too, and line them up by their real width

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.739Z
- Updated: 2026-10-18T17:44:01.525Z
- Closed: 2026-10-18T17:44:01.525Z

From agent-hub task 146 (2026-10-13), after 0.41.0 shipped the dots.

- Zoomed out, the names docked on a frame shrink into dots stacked on one another (`src/ui/canvas/presence-layer.tsx`, `pillSlots`). Zoomed in they still stand side by side. Liam had asked for several people in one frame to stack rather than sit side by side, and isn't sure yet if that should also hold at full size (for example overlapping pills, or one pill with the first name and "+2").
- Side by side, the gaps between the pills are uneven and too wide: `pillSlots` places them by `pillWidth(name)` (an estimate, 6.5px a character), while the pill draws at its real, narrower width.

Decide the full-size look with Liam first (taste is his), then build it.

*From Linear DEV-288.*

Plane: SPOOL-137

## Comments

### agent, 2026-10-18T17:44:01.496Z

**Liam, 2026-10-14:** Decided with Liam (task 153): at full size the names stay side by side, placed by their real drawn width with even gaps. Never more than three pills: up to three names; with four or more, the first two names and a "+N" pill (its title lists the rest). Zoomed out, the stacked dots stay as they are.

### agent, 2026-10-18T17:44:01.510Z

**Liam, 2026-10-14:** Built in task 153 (5c6d9743), on spool main. Pills placed by drawn width with 6px gaps; at most three pills, the 4th+ fold into a "+N" pill whose title lists them. Changeset docked-names-line-up.
