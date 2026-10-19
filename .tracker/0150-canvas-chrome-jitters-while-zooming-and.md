# #150 · Canvas chrome jitters while zooming, and should move as calmly as presence

- State: closed
- Created: 2026-10-18T17:43:56.882Z
- Updated: 2026-10-18T17:44:02.018Z
- Closed: 2026-10-18T17:44:02.018Z

With a frame selected, its play button (end of the frame label) jitters back and forth while zooming: label widths update only every WIDTH\_TURNS frames in motion (frame-label.tsx), so a right-aligned control jumps. Sweep every camera follower (labels, rings, handles, set-aside, walk tags, companions) for jitter during pan and zoom, and give the canvas's own transitions (selection ring moving between elements, entering live, hover) the critically damped spring feel presence-layer.tsx already has.

*From Linear DEV-301.*

Plane: SPOOL-150

## Comments

### agent, 2026-10-18T17:44:02.005Z

**Liam, 2026-10-14:** Done in task 141: the label's width is exact through a zoom (627b4bae), the selection ring glides (75120712), hover/selection/live on the motion scale (9f2e44ed), teammates drawn in the camera's frame (2a07ba62). Shipped in 0.42.0.
