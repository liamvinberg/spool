# #152 · Split the canvas's landing re-render and the document's report renders

- State: closed
- Created: 2026-10-18T17:43:56.904Z
- Updated: 2026-10-18T17:44:02.095Z
- Closed: 2026-10-18T17:44:02.095Z

Left after #145 (notes: bench/entry.ts, merged 576edf7f). About 100 ms after the camera lands, the canvas re-renders and mounts the neighbouring frames in one 61 ms task, on every camera stop. Each live document reporting in costs a 4 to 15 ms React render. At 4x CPU throttle these, plus GC, drop most of an entry's flight frames (7 of about 26 drawn). Mount neighbours across frames rather than in one task, and keep document reports out of a full canvas render. Measure with `node bench/entry.ts` on the m1 at 1x and 4x.

*From Linear DEV-303.*

Related: #145

Plane: SPOOL-152

## Comments

### agent, 2026-10-18T17:44:02.085Z

**Liam, 2026-10-14:** Done in task 141: 2c0fe7b3, 86d9d0d0, c6d6e519, 3d0cafa6 (mount one ring document a frame, reports render their own shell). Shipped in 0.42.x.
