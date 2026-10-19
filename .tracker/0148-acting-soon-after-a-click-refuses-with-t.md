# #148 · Acting soon after a click refuses with "the file was never read"

- State: closed
- Created: 2026-10-18T17:43:56.858Z
- Updated: 2026-10-18T17:44:01.935Z
- Closed: 2026-10-18T17:44:01.935Z

Every click on an element starts POST /rungs, the read a hand edit is measured against: 190 to 290 ms idle, 0.6 to 3.4 s right after a save. Pressing Delete (or committing words) before it lands refuses with `unread`: "the file was never read; select the element again". A gesture should wait for the read rather than refuse, and the read should be fast.

Measured on the m1 (M1 Pro, 120 Hz) against a copy of spool's design canvas, task 141. Rerun with `node bench/qa-editing.ts --project <copy> --frame app/spool-player` and `node bench/canvas.ts`.

*From Linear DEV-299.*

Related: #154

Plane: SPOOL-148

## Comments

### agent, 2026-10-18T17:44:01.924Z

**Liam, 2026-10-14:** Done in task 141: a gesture ahead of the read waits for it (ff88c546), and the read is fast (2ab7b078, 1c9f4a04): click to /rungs ~19 ms idle, ~5 ms after a save. Shipped in 0.42.0.
