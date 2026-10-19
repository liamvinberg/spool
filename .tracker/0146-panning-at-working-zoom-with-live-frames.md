# #146 · Panning at working zoom with live frames drops to 60 fps

- State: closed (wontfix)
- Labels: wontfix
- Created: 2026-10-18T17:43:56.837Z
- Updated: 2026-10-18T17:44:01.859Z
- Closed: 2026-10-18T17:44:01.859Z

At k=0.85 on the app page with live frames on screen, pan and zoom p95 is 17 ms on a 120 Hz screen, with 20 to 25% of intervals over 12 ms. At k=0.45 (overview, 2 live documents) p95 is 10.4 ms with 2% over. Earlier evidence (bench/evidence/readable-frame-pan-cost) points at child-frame renderer and GPU raster waits.

Measured on the m1 (M1 Pro, 120 Hz) against a copy of spool's design canvas, task 141. Rerun with `node bench/qa-editing.ts --project <copy> --frame app/spool-player` and `node bench/canvas.ts`.

*From Linear DEV-297.*

Plane: SPOOL-146

## Comments

### agent, 2026-10-18T17:44:01.850Z

**Liam, 2026-10-14:** Not spool's to fix (task 141, worker pan): a plain HTML page with no spool, no iframes and no WebGL misses the same ~20% of vsyncs under the same wheel input on the m1. Chromium's frame deadline timer on macOS wakes ~8 ms late while idle; spool's page is busy 1 to 3 ms a frame. Evidence: bench commits fe6633ca, 68d53102.
