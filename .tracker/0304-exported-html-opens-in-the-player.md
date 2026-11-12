# #304 · Exported HTML opens in the player

- State: open
- Labels: ready-for-agent, enhancement
- Parent: #300
- Blocked by: #302, #303
- Created: 2026-11-11T21:22:56.788Z
- Updated: 2026-11-11T21:22:56.788Z

## Parent

#300

## What to build

An exported HTML file opens in spool's player.

**In the export dialog**, the HTML choice gets one row: a "With player" switch, on by default, with the line "Anyone can resize it in the browser." under it ("Opens as the frame alone." when off). The choice is remembered the way the dialog remembers its others. The daemon's HTML export takes a player flag; absent means without, so nothing else changes.

**The file, with player:**
- Outer document: the player shell with a new **export host** (fixed geometry baked into the file, no walk reporting, no repair, no recorder). Inner document: the packed composition export builds today, booted the way the live player's inner document is, inside a sandboxed iframe, so the frame has a real viewport and responds to its size.
- The bar is what the live bar is in a browser tab, minus record, close, copy link and comments. Name on the left, size pill in the centre.
- It opens at As drawn, scaled down to fit a smaller window. The pill's menu has the same six rows; "Window" is the viewer's own browser window. The edges pull with the same pill, readout, ticks and snapping. This must be the live player's code, not a copy.
- Links between exported frames walk as they do today, with their transitions. External links open in a new tab.
- When the viewer's primary input is touch, there is no bar and no grips and the frame fills the viewport. This rule is the export host's only; the live player keeps its bar at narrow widths.
- It works opened from disk with the network off, in Chrome, Safari and Firefox, wherever today's export does.
- Keep the file lean: do not carry React twice if one copy can serve both documents without contortions. Report the size with and without the player.

**Without player**, the file is exactly what export produces today.

**The look is decided.** Liam approved it on the canvas. The frames, marked To build, are `design/frames/app/spool-canvas--export*` (the dialog with the switch) and `design/frames/app/spool-exported`, `--size-menu`, `--size-drag`, `--phone`. Build to match them. If the code ends up drawing something they do not show, redraw the frame and say so.

Turned down: always wrapping exports in the player; a separate lighter player for exports; hiding the bar by default.

## Acceptance criteria

- [ ] Exporting HTML with the switch on gives a file that opens from disk, network off, in the player.
- [ ] Picking a preset or pulling an edge changes the frame's own viewport, so a media query in the frame responds.
- [ ] A flow of several frames walks inside the player with its transitions.
- [ ] With a touch primary input there is no bar and the frame fills the screen.
- [ ] No record, close, copy link or comments anywhere in the file.
- [ ] With the switch off, the output is unchanged from today.
- [ ] The existing export browser test is extended to prove the above once each; the shell core is shared with the live player, with no duplicated chrome or sizing code.
- [ ] The canvas frames match what ships and their To build row in design/AGENTS.md is removed.
- [ ] GLOSSARY.md's Player and Edge bar entries are true again (Player still says "without scaling").
- [ ] A changeset.
