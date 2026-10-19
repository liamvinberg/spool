# #27 · Spike: a WebGL picture layer inside the shipped canvas

- State: closed
- Labels: wayfinder:research
- Parent: #23
- Blocked by: #24, #26
- Created: 2026-10-18T17:43:55.540Z
- Updated: 2026-10-18T17:43:57.811Z
- Closed: 2026-10-18T17:43:57.811Z

## Hypothesis

Drawing every cover as a texture in one WebGL2 canvas, with live frames and canvas chrome in a DOM overlay moved in the same rAF, holds the refresh rate on a 1000-frame overview where no DOM arrangement does.

## Evidence so far

Research 113, section 3: in a standalone page, today's DOM structure stalled up to 275 ms (707 under load) at 1000 frames on the overview; tuned and culled DOM up to 440 ms (1.7 s under load); WebGL held the refresh rate at every zoom and count with 0.3 to 1.5 ms main thread per frame. Screenshots mid-pan showed the DOM overlay in exact lockstep with the GL layer, provided the GL draw happens in the same rAF callback that moves the DOM and the context is not `desynchronized`. The hybrid arm showed single 40 to 117 ms frames, probably from label elements being created and destroyed mid-zoom (unattributed).

## The spike

- The picture layer behind the existing frame shells, drawing covers for every frame in `picture` state; a `live` or `held` frame keeps its iframe in the DOM above it.
- A thumbnail tier always resident (256 px in the spike, in a texture array, one instanced draw), full covers streamed by on-screen size, uploads capped per frame.
- Labels pooled rather than created per frame, or drawn on the GPU; attribute the hybrid spikes with a trace either way.
- Hit testing stays in world coordinates, as it is today (`frameAtWorld`).

## Gate

On the 1000-frame page, interleaved against stock, three rounds: no frame over 12 ms in a pan or zoom on the overview and at readable zoom, at 1x; GPU process memory recorded; first paint of the overview under 2 s; lockstep confirmed in the real canvas with the research 113 probe.

Blocked by the bench ticket and the camera spike.

*From Linear DEV-126.*

Related: #31

Plane: SPOOL-27

## Comments

### agent, 2026-10-18T17:43:57.806Z

**Liam, 2026-10-02:** **Done, pushed to main (`c66de195`..`36cf633f`).** Built to landable quality rather than as a spike; four review rounds.

Frames showing their still are drawn by one WebGL2 canvas behind the DOM, inside the camera store's callback (no own loop, no desynchronized context). Each still lives on the GPU as a 64 px square in one texture array plus halvings streamed by drawn size within a two-screen budget; one fetch and decode per still, halved on two loader workers; off-screen squares wait while documents boot. Live and held frames keep their DOM shell and cover fade; cover-less frames keep the placeholder shell. Labels moved to a screen-space DOM field. Context loss rebuilds.

Final gate against main (4 interleaved rounds):

|  | main | GPU layer |
| --- | --- | --- |
| n1000 overview pan / zoom, frames over 12 ms | 27 / 49.5 | 0.5 / 8.5 |
| n1000 at 0.45, pan / zoom over 12 ms | 2.5 / 8.5 | 0 / 0 |
| n1000 reload cold / warm (fair mark: every on-screen frame at its wanted texture) | 1791 / 627 ms | 786 / 429 ms |
| n200 reload cold / warm | 634 / 362 ms | 502 / 343 ms |
| n1000 first complete overview | 1.80 s | 1.55 s |
| double-click to clickable n200 / n1000 | 60 / 260 ms | 55 / 242 ms |
| GPU memory at 0.45, n1000 | 238 to 280 MB | 334 MB |

Parity at rest: mean difference 0.1 to 0.65 levels; lockstep within 2.5 device px. The remaining overview zoom misses trace to DOM label layerization and layout (4 to 6 ms a step): #35. Accepted trades (agent's call on Liam's delegation): soft small frames during a zoom, label widths trailing up to 3 frames in motion, a live frame drawing over an overlapping later picture, about 50 to 100 MB more GPU memory at mid zoom.
