# #294 · New window: the run-through on the m1, and the numbers

- State: open
- Labels: ready-for-agent
- Parent: #284
- Blocked by: #291, #292, #293
- Created: 2026-11-11T10:15:04.938Z
- Updated: 2026-11-11T10:15:04.938Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

Proof on Liam's Mac that the new window with the five extensions is real, and the numbers that say whether the small core is faster.

On the m1 (the `m1` skill), in a Mac app built from main with the experiment `new-window` on:

1. **A working session**, by hand through the app: open spool's own canvas and a small project; pan, zoom, select, move, resize, rename, copy, trash and restore, undo and redo across all of it; go into a frame and edit by hand; Pages and Properties throughout; tune a knob and write it back; follow a flow's arrows and walk it in the player; make a presentation, drag slides, go into one, present it with the room on a second display, export it.
2. **Switches**: each of the five off and on in Settings while a project that uses it is open. Nothing else moves, nothing is lost, frames keep rendering.
3. **Speed**, old window against new, on spool's own canvas: time from opening the project to the first usable picture, frame times while panning and zooming, memory after a minute, idle CPU. Three runs each.
4. **Motion**: record the session's drags, drops, page switches and switch flips at 60 fps and go through the recordings frame by frame for any blank, swap or reversal.
5. **The parity list**: every suite named by the earlier tickets passes against the new window on CI.

Fix what fails, each fix with a test where a test can see it. Write down what was seen, with screenshots and the recordings' location, and the numbers as a table. Bring a choice the spec does not settle to task 557.

## Decided

- The new window does not become the default here and a beta build does not switch it on; that is stage three, after the rest of the features move.
- "Not slower on any number" is the bar. Where the new window is slower, find why and fix it in the core, not by cutting what it draws.

## Where to start

How the deck's release run was done: `~/.brain-archive/release-run/` on devobee (sheets, shots, the virtual second display tool), `desktop/README.md`, the `m1` skill, `bench/`.

## Done when

- The session, the switches and the recordings are clean, or every finding is fixed or filed with what was seen.
- The numbers are in the handoff, new not slower than old on each.
- The parity list is green on CI.
- A message to task 557 with the handoff.
