# #268 · Deck: the deck page on the canvas (the band, the grid, the drop rules)

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Blocked by: #266, #243
- Created: 2026-11-10T17:59:12.062Z
- Updated: 2026-11-10T21:25:06.333Z
- Closed: 2026-11-10T21:25:06.333Z

## Parent

#265 (the spec; read it first, then ticket #255's resolution for what was decided and turned down)

## What to build

The deck page on the canvas. Opening a deck page shows the band behind the talk, slides numbered on their labels, loose frames in their grid, and dragging follows the deck's rules.

Read the spec's "The deck page on the canvas", and play `app/spool-deck` on the team canvas: it is the reference for the band, the outline, the drop zones and the motion. Follow it literally; the prototype's `field.tsx` holds the constants.

- A page policy for deck pages: alignment guides, gap snapping and resize handles off; the deck's snapping on.
- The band as a canvas layer under the frames, lifting while a frame is held over it, running past the last slide.
- Dragging: the held frame follows the pointer, one outline shows the slot or cell, and the drop sends one intent to the daemon's deck change (insert, trade, take out, reorder, several at once, a loose move). The window previews; the daemon decides and writes. One undo entry per drop.
- The number before a slide's name on its label. The label's play slot presents from that slide (it calls Present from the presenting ticket if that has landed; otherwise leave the call site ready and say so in the handoff).
- The window reads the deck through the deck read and follows deck changes.

## Where to start

`src/ui/canvas/canvas.tsx`: the drag and resize handlers and where they call `snap.ts` and draw guides; `commitGeometry`; the hand-written list of layers in the render tree; `frame-label.tsx` and its play slot; `canvas-store.ts`. Keep the deck's code in its own modules and give `canvas.tsx` call sites only: it is 6,600 lines and is being replaced, so the less the deck weaves into it the better.

## Leave alone

Dragging, snapping and resizing on ordinary pages: they must behave exactly as today. Entering a frame (its ticket follows). The rail and Properties (next ticket).

## Done when

- In a browser, on a fixture deck: a loose frame dragged between two slides joins there; onto the middle of a slide trades and the notes follow the place; a slide dragged down leaves; several join in their order; each is one undo. An ordinary page still snaps and resizes as before.
- With the experiment off a deck page is an ordinary page.
- The page matches `app/spool-deck` side by side; attach the screenshots to the handoff.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Comments

### agent, 2026-11-10T19:41:38.196Z

**From task 557, 2026-11-10:** #243 is fixed and on main (283bf00a), and the shared 7767 daemon runs it. The rule against fetching `design/` into a worktree is lifted for worktrees made from main at or after that commit (update first). This ticket's worker may run `pnpm -s dev open .` and play the design frames as its body says. Before a worktree holding a `design/` is removed by hand, run `pnpm -s dev remove <path>` first.

### agent, 2026-11-10T21:25:06.333Z

Landed on main at edc1c78e, behind the experiment `deck`. Side-by-side screenshots are in /tmp/pi-orch/spec-575/handoffs/t268/. Open: several frames dropped over a slide's middle go in on the nearer side and don't trade (the prototype only drags one frame); arrow keys and Tidy do nothing on a deck page; an undo pressed before the daemon answers a drop undoes the entry before it; Properties' x/y can still nudge a frame, and the daemon puts it back (#271).
