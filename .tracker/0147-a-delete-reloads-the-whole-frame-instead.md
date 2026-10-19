# #147 · A delete reloads the whole frame instead of removing the element in place

- State: closed
- Created: 2026-10-18T17:43:56.848Z
- Updated: 2026-10-18T17:44:01.897Z
- Closed: 2026-10-18T17:44:01.897Z

Delete writes the file in 24 ms but the screen changes only after 250 to 290 ms, because the frame's document is replaced. Undo is the same (216 to 347 ms). Text edits already change the frame in place and keep the document. Delete, undo and redo of structure should do the same.

Measured on the m1 (M1 Pro, 120 Hz) against a copy of spool's design canvas, task 141. Rerun with `node bench/qa-editing.ts --project <copy> --frame app/spool-player` and `node bench/canvas.ts`.

*From Linear DEV-298.*

Related: #154

Plane: SPOOL-147

## Comments

### agent, 2026-10-18T17:44:01.888Z

**Liam, 2026-10-14:** Done in task 141: delete and undo change the frame in place (67ed5218, ba5c95c4, 9c24ab4c). Delete to screen went from ~250 ms to ~4 ms on the m1. Shipped in 0.42.0.
