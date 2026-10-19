# #145 · Entering a live frame from a zoomed-out canvas lags

- State: closed
- Created: 2026-10-18T17:43:56.827Z
- Updated: 2026-10-18T17:44:01.820Z
- Closed: 2026-10-18T17:44:01.820Z

Liam: double-clicking a frame while zoomed out to enter it lags and doesn't feel good. The camera's fly-in, the document mount and the still-to-live handover should read as one smooth move, with no dropped frames during the fly and no pop at the end.

Measured on the m1 (M1 Pro, 120 Hz) against a copy of spool's design canvas, task 141. Rerun with `node bench/qa-editing.ts --project <copy> --frame app/spool-player` and `node bench/canvas.ts`. `bench/canvas.ts --zoom 0.16 --headed` keeps the overview-entry route.

*From Linear DEV-296.*

Related: #152

Plane: SPOOL-145

## Comments

### agent, 2026-10-18T17:44:01.811Z

**Liam, 2026-10-14:** Done in task 141: bench/entry.ts (576edf7f) found the causes, and the fixes landed with #152 (2c0fe7b3, 86d9d0d0, c6d6e519, 3d0cafa6). Shipped in 0.42.x.
