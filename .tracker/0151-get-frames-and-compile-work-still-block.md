# #151 · GET /frames and compile work still block the daemon's loop after a shared save

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.893Z
- Updated: 2026-10-18T17:44:02.057Z
- Closed: 2026-10-18T17:44:02.057Z

Left after #149 (merged in ea44fd64). From m1 profiles after a save to a shared file of spool's design canvas:

- GET /frames → listProjectFrames runs fully synchronously after a shared event: 48 to 68 ms a call, 766 ms total in one profile. About half is readSidecar → resolveDesignPath realpath; the rest scanCovers, unseenNow folder walks and discover.
- compileFrameDocument → unstyledClasses/styled: 37 to 51 ms a turn.
- compilePlayer's hash update: 107 ms.
- /rungs and /flows still wait one fresh rebuild of the affected frames (about 200 to 250 ms for 165 frames).

Measure with bench/save-busy.ts (--cpu-prof for profiles).

*From Linear DEV-302.*

Related: #149

Plane: SPOOL-151

## Comments

### agent, 2026-10-18T17:44:02.048Z

**Liam, 2026-10-14:** Built in task 153 (0f2bdab3, aa9660a7, 41272951, adbdd9fe, 86c31843), on spool main. GET /frames lists off the event loop; unstyledClasses ~85% cheaper (248 to 32 ms on spool-home); player chunk/digests reused. Measured on devobee under load; worth a bench/save-busy.ts run on the m1.
