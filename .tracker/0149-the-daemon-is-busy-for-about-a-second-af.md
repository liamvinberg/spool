# #149 · The daemon is busy for about a second after every save

- State: closed
- Created: 2026-10-18T17:43:56.871Z
- Updated: 2026-10-18T17:44:01.973Z
- Closed: 2026-10-18T17:44:01.973Z

After a hand save, the requests that follow (/rungs, /flows, PUT /selection) take 0.5 to 3.4 s, against single milliseconds when idle. Likely the recompile and photo booth retake of every frame that uses the edited shared file holding the event loop. Interactive requests should never queue behind background work.

Measured on the m1 (M1 Pro, 120 Hz) against a copy of spool's design canvas, task 141. Rerun with `node bench/qa-editing.ts --project <copy> --frame app/spool-player` and `node bench/canvas.ts`.

*From Linear DEV-300.*

Related: #151

Plane: SPOOL-149

## Comments

### agent, 2026-10-18T17:44:01.963Z

**Liam, 2026-10-14:** Done in task 141 (2f3a9b87, 69a06230, 5b134a40, merged in ea44fd64). Shipped in 0.42.0. What's left is #151.
