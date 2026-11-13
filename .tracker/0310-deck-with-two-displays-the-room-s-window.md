# #310 · Deck: with two displays the room's window lands on the wrong display, over the slides (seen with AeroSpace running)

- State: closed
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-12T08:25:59.015Z
- Updated: 2026-11-12T12:48:07.501Z
- Closed: 2026-11-12T10:35:35.741Z

## What Liam saw

In spool 0.56.0 (experiment `deck`) on his own Mac, with two displays and the tiling window manager AeroSpace running, he presented full screen and got the screenshot at `~/.brain-archive/present-two-displays/` on devobee (the 2000x1126 one; view it first). His words: "full screen looked like this i have two displays so maybe thats why, or if aerospace messed it up for me".

## What the screenshot shows (read from its pixels, not confirmed)

The display in the picture is 16:9, most likely 1920x1080 points. The slide fills it edge to edge, behind. In front, at the top left under the menu bar's height, is a second window showing the same slide letterboxed on black, and its size works out to about 1512x982 points: the size of a 14-inch MacBook Pro's built-in display. So this looks like the caret's Full screen with two displays ("slides here and in the room's window", #298): spool's window filled the external display as it should, and the room's window (`desktop/src/room.ts`, `cover()`, which sets the window to the other display's bounds in one step since #308) took the built-in display's **size** but ended up **on the external display**, over the slides.

Two suspects, and it may be both:
1. **AeroSpace.** It manages every window, keeps windows in its own workspaces (each tied to a monitor) and may move or resize a new window into the focused workspace. People who use it often also turn off "Displays have separate Spaces" in macOS.
2. **Spool's own placing**, in an arrangement never tested: every two-display proof so far (#298, #306, #308) had spool on the m1's built-in display and the room on a virtual 1920x1080 one. Here spool was on the external display and the room was to go to the built-in one (notch, a different scale factor, and an origin that may be negative or non-zero).

## Wanted

Find the cause by reproducing it on the m1 (the `m1` skill; the virtual display tool is noted in `~/.brain-archive/release-run/`), in this order: (a) no AeroSpace, spool on the virtual display and the room going to the built-in one, in each arrangement of the two (left, right, above, and with the virtual one as the main display), with "Displays have separate Spaces" on and off if that can be switched without logging out; (b) with AeroSpace installed and running with its default config. Then make presenting right in every case found:

- The room always ends up covering the display it was meant for, and spool's window the one it is on; after showing, check where each window really is and put it right if something moved it, without the two fighting in a loop.
- With AeroSpace: the slides and the room are never tiled, resized or moved by it (find what makes AeroSpace leave a window alone and use it if the app can; if only the user's AeroSpace config can do it, say exactly which lines, and make spool survive as well as it can without them).
- Check the other shapes too: one display with AeroSpace (the full-screen slides of #306 and coming home to exactly where the window stood, which a tiling manager may also fight), the presenter view with the room's window on one display, X swapping displays, and ending the talk.

## Care on the m1

Another task (621, ticket #309) is building and measuring on the m1 at the same time. Use your own lane and port, do not quit apps you did not start, run AeroSpace only in short bursts and quit it after each (it moves every window on the machine), and uninstall it when done. Message task 621 (message_task) before your first AeroSpace burst so its measurements are not spoiled. Put a time limit on every command that could wait for input.

## Done when

The cause is named with proof; each case above is shown right on the m1 with screenshots of both displays; a test at the cheapest level that can see the rule (the placing logic as a function); `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset; merged to main with CI green, not released. A message to task 557 with the cause, what was fixed, what a person with AeroSpace must do if anything, and before any choice this ticket does not settle. Close the task yourself when done.

## Comments

### agent, 2026-11-12T08:26:30.128Z

Correction: the screenshot is the 3838x2160 one (CleanShot_2026-11-12_at_09.22.142x.png), so the display is 1919x1080 points at 2x, and the window in front works out to 1512x982 points.

### agent, 2026-11-12T10:35:35.741Z

Fixed on main (316b5581, d5704a06, 642f9211). desktop/src/window-manager.ts tells AeroSpace, through its own CLI when it runs, to float a talk's windows and move them to their display; the room stays invisible until it is placed. Spool's window is tiled again after only if it was tiled. Checked on the m1 with AeroSpace 0.21.3 in every arrangement, with X, End/Esc/close and unplugging. Config lines are in skill/topics/deck.md.

### agent, 2026-11-12T12:48:07.501Z

Merged to main and judged in task 557.
