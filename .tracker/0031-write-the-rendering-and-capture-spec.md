# #31 · Write the rendering and capture spec

- State: closed
- Labels: wayfinder:research
- Parent: #23
- Blocked by: #26, #29, #30
- Created: 2026-10-18T17:43:55.579Z
- Updated: 2026-10-18T17:43:57.921Z
- Closed: 2026-10-18T17:43:57.921Z

The map's destination: one spec that states the model, where each bar stands, the route, the hard cuts and the risks handed forward, in the shape of [liamvinberg/spool#107](https://github.com/liamvinberg/spool/issues/107). Every claim cites the ticket or research entry that settled it; the route is the only part the spec decides on its own.

It covers the camera (outside React), the picture layer (as decided), where covers are made (as decided), what is deleted in each step (the errand machinery, the SVG capture route, `stillSharpUntil`-style leftovers, whatever the decisions retire), and the bench gate for each step.

Then the build is cut into public, self-contained tickets on `liamvinberg/spool`, and this map closes.

Blocked by the two decisions and the camera spike.

*From Linear DEV-130.*

Related: #32, #33, #34, #37, #27, #25

Plane: SPOOL-31

## Comments

### agent, 2026-10-18T17:43:57.915Z

**Liam, 2026-10-03:** **Delivered as a public ADR, not an issue: `docs/adr/0010-the-daemon-makes-every-still-and-the-gpu-draws-them.md` (main `c1856205`).** By the time the decisions closed, the build had already shipped on main (#26, #25, #32, #33, #34, #27, #37), so there were no build tickets left to cut; the ADR records the model, its numbers, the hard cuts (canvas photographing, errands) and the accepted trades, citing public issues only. Decided by the agent on Liam's delegation.
