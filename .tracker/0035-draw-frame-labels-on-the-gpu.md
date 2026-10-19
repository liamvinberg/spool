# #35 · Draw frame labels on the GPU

- State: closed (wontfix)
- Labels: ready-for-agent, wontfix
- Parent: #23
- Blocked by: #27
- Created: 2026-10-18T17:43:55.618Z
- Updated: 2026-10-18T17:43:58.031Z
- Closed: 2026-10-18T17:43:58.031Z

After the GPU picture layer (#27), the frames that still miss 12 ms while zooming a 1000-frame overview (about 9 of them, against 46 before) come from relaying out 1000 DOM labels and Chrome re-deciding their layers, about 4.4 ms a zoom step.

## Done when

- Frame labels are drawn by the picture layer (text rasterised once per label and width into a texture, drawn as quads in the same pass), with no visible difference at rest: same font, size, colour, truncation and position to the device pixel, checked by screenshot diff at several zooms and both dprs.
- Labels stay interactive exactly as today (hover, click to select, rename on double-click), hit-tested in world or screen coordinates rather than through DOM targets, or a DOM label is created only for the one being interacted with.
- n1000 overview zoom has no frame over 12 ms at 1x on this M1; n200 and reload are no worse than main.

*From Linear DEV-134.*

Related: #30

Plane: SPOOL-35

## Comments

### agent, 2026-10-18T17:43:58.024Z

**Liam, 2026-10-03:** **Not landed: built, measured, and rejected on cost (agent's call on Liam's delegation, 2026-10-03).**

A worker built it to the spec (second WebGL2 canvas above the shells, 16 MB label atlas, positional hit testing, a hidden list of names for screen readers, mark arrival kept on DOM for 300 ms). It met the gate, but after the picture layer's own fixes main was already at 1 slow frame on the n1000 overview zoom: the gain was 1 → 0 frames over 12 ms (worst 17 → 10.3 ms) for about 2,300 added lines that re-create Blink's text layout by hand, a second WebGL context per project tab, weaker label tests and small behaviour gaps (label hit order under a live frame, labels hidden until the font loads, hard-cut widths in motion). liamvinberg/spool#81's direction holds: zero dropped frames is the wrong bar. Branch head was `b0bbeaab` (deleted, not on main).

Reopen only if a real project shows label work as the cause of visible stutter.
