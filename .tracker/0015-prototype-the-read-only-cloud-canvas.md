# #15 · Prototype the read-only cloud canvas

- State: closed
- Labels: wayfinder:prototype
- Parent: #3
- Blocked by: #6
- Created: 2026-10-18T17:43:55.436Z
- Updated: 2026-10-18T17:43:57.472Z
- Closed: 2026-10-18T17:43:57.472Z

## Question

What can someone see and do in the canvas Spool Cloud serves in a browser? Browse pages, pan and zoom with their own camera (the camera is per browser today, never in the project's files), enter and play frames, all with no editing, no agent rail and no source, and everything static except the frames themselves. Who gets it: members, invited outsiders, or both. Carries [read-only canvas sharing](https://github.com/liamvinberg/spool-cloud/issues/163) and its boundary: hiding controls is not enough, nothing a viewer does may write to anyone's project. Earlier sketches were not accepted. Drawn as spool frames under `design/frames/explore/cloud/`.

*From Linear DEV-114.*

Related: #16, #39, #47, #50, #62

Plane: SPOOL-15

## Comments

### agent, 2026-10-18T17:43:57.461Z

**Liam, 2026-10-04:** ## Resolution (prototype with Liam, 2026-10-04)

**In a browser, the read-only canvas is the shipped canvas with every authoring control taken off.** The pages rail stays. The tool bar, the dock, the agent and selection go. Clicking a frame plays it.

- **What's on screen.** A browser tab at spool.page/tidemark/tidemark-app/. On the left is the pages rail as it ships (team mark and project name, pages, frames under the open page). The field shows frames live, with their threads and labels that stay the same size at any zoom. Bottom right are the zoom level and fit. Nothing on the canvas can be selected, and nothing a viewer does is written anywhere: the camera and any clicks inside a frame stay in that tab.
- **The camera is the viewer's own.** Scroll pans, ⌘ or ctrl scroll zooms around the pointer, and a flick on empty canvas coasts to a stop. Clicking a frame in the rail glides the camera to it. Switching pages fades the old page out and lays the new one in frame by frame.
- **Playing** opens the player in the same tab. The frame grows out of its spot on the canvas into the player, the bar is the shipped 30px player bar (frame switcher, size, eye, close; here close returns to the canvas), and leaving shrinks the frame back into place. The URL follows the page and the played frame, so copying it sends that view.
- **A member** sees the team canvas live: a teammate's save shows up in place with the changed mark and a short toast. Who's looking appears top right, teammates' cursors are shown, and "Open in spool" hands over to the Mac.
- **An outsider** sees only the pages someone shared with them. The other pages don't exist for them, nobody sees them and they see nobody. One line says who shared it and when it last updated.

Rejected: `bare` (a full-bleed field with a floating crumb, where playing happens in place) and `walk` (opens inside the first frame with a flow strip). Liam called the rail the obvious choice.

The phone is out of this ticket: how the canvas and play work on a phone moves to Prototype a shared link on a phone (#16), along with four phone takes drawn here as a head start.

Frames: spool `design/frames/explore/cloud/canvas/` (`viewer-rail`, `--play`, `--outsider`, over `design/shared/ui/explore/cloud/canvas/rail.tsx`), commit `6bd65a70`. The rejected takes were deleted once this was decided (`89bf9fdc`); git keeps them.

### agent, 2026-10-18T17:43:57.466Z

**Liam, 2026-10-04:** Motion follow-up (2026-10-04): Liam found the first motion too smooth and slow for spool. It now uses spool's own timings: the camera flies 220ms on the canvas's cubic ease-out and doesn't coast after a drag. Pages crossfade in 120ms with nothing staggered. The player grows out of the frame and shrinks back in 240ms on the house curve, and its bar comes down in 180ms. The exact motion is expected to change when it's built; the direction is quick, the way the shipped canvas is. Commit `c7af5a56`.
