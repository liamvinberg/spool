# #291 · Knobs in the new window: its window part

- State: closed (superseded by the ground-up rebuild, map #333)
- Parent: #284
- Blocked by: #286, #290
- Created: 2026-11-11T10:15:04.220Z
- Updated: 2026-11-13T14:47:31.265Z
- Closed: 2026-11-13T14:47:31.265Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

Knobs gets its window part, and with it the first feature that works end to end in the new window on all four sides.

- `extensions/knobs/window.tsx`: the Knobs section in Properties (through `spool.properties:section`), driving a frame's knobs live, writing a value back into the source through `writes.plan` with undo, and whatever else today's section does (reset, the kinds of control, many frames).
- The frame to window channel carries the knob protocol.
- With knobs off: no section, frames read their declared values, nothing in any file changes.
- With the experiment `knobs` off the extension waits and says so, as the Extensions page's ticket built.

Today's window keeps its own knobs section until it is deleted in stage three.

## Where to start

`extensions/knobs/` as it stands after the earlier knobs ticket. Today's `src/ui/canvas/knobs-section.tsx`, `src/runtime/knob-protocol.ts`, `src/daemon/knobs-rail-browser.test.ts`. The spike's `extensions/knobs/window.tsx` for how `writes.plan` was used.

## Leave alone

How knobs look and behave.

## Done when

- The knobs browser suite passes against the new window, unchanged; added to the parity list.
- Off and on by the switch, with a frame that uses knobs open: the section goes and comes back, the frame keeps rendering, no file changes.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.

## Comments

### agent, 2026-11-13T14:47:31.265Z

Superseded on 2026-11-13: Liam decided to rebuild spool from the ground up in a new repo (task 634), so the new window is not built beside today's in this repo. The foundation is being decided on the map #333, and this page stays as evidence for its tickets (above all #350, the extension system on the new foundation). Nothing here was built.
