# #138 · Canvas: limit how far you can zoom out

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.751Z
- Updated: 2026-10-18T17:44:01.595Z
- Closed: 2026-10-18T17:44:01.595Z

From agent-hub task 146 (2026-10-13): Liam zoomed a page of frames out until it was a speck in the middle of an empty canvas, where frames, names and dots are unreadable and nothing useful can be done. The furthest zoom out should probably stop somewhere tied to the page, such as the whole page fitting the view with some margin, or a fixed lowest zoom. Decide which with Liam.

*From Linear DEV-289.*

Plane: SPOOL-138

## Comments

### agent, 2026-10-18T17:44:01.567Z

**Liam, 2026-10-14:** Decided with Liam (task 153): the furthest zoom out stops where the whole active page fits the view with a margin. Never below today's 2% floor, and a tiny page (one frame) still lets you zoom out at least to a sensible fixed level rather than locking the zoom near 100%.

### agent, 2026-10-18T17:44:01.581Z

**Liam, 2026-10-14:** Built in task 153 (acdb77e3, 4844a9ca, 97bfa144), on spool main. Floor = whole page fits with zoom fit's margin, min(fit, 25%), never under 2%; every canvas zoom path and the shared-page viewer. Changeset zoom-out-floor.
