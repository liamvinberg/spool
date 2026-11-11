# #272 · Deck: going into a slide and playing in place

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Blocked by: #270, #268
- Created: 2026-11-10T17:59:13.296Z
- Updated: 2026-11-11T02:23:42.939Z
- Closed: 2026-11-11T02:23:42.939Z

## Parent

#265 (the spec; read it first, then ticket #255's resolution for what was decided and turned down)

## What to build

Going into a slide. On a deck page, double-click or Enter on a slide flies the camera in and the talk plays in place, with the same keys as on stage; Esc flies back.

Read the spec's "Going in" paragraph and play `app/spool-deck--inside` on the team canvas. The prototype's `field.tsx` holds the fly's duration, easing and room, and the rules for where the camera returns.

- The fly in (600 ms, the prototype's easing, fitted with its room) and the stage mounted over the slide at the slide's last beat. The slide's own picture stays until the stage has drawn the same picture over it: going in never blinks, whether or not the stage was already built.
- The deck's keys while inside, through a scope that stands ahead of the canvas's own (Space must not borrow the Hand here), and from inside the slide through the stage.
- Esc: back to the exact camera from before when the talk is still on the slide entered; otherwise the same zoom and height, centred on the slide the talk ended on, which becomes the selection. A press outside leaves the same way.
- ⌘ double-click still opens the slide's words through Edit, unchanged. The cue the design draws while a live slide has the keyboard.
- Build the talk's stage in the background when a deck page opens, so going in is instant.
- Going in and coming out joins the canvas-flow browser test.

## Where to start

`enterFrame`, `entryCamera` and the Esc and outside-press handlers in `src/ui/canvas/canvas.tsx`; `camera.ts` and `camera-store.ts` (today's fly is 220 ms and Esc does not restore the camera); the hotkey scopes and their priority in `src/ui/hotkeys.ts` and `hotkey-dispatch.ts`; the stage and how the presenter view hosts it.

## Leave alone

Entering a frame on an ordinary page: same camera, same keys, no return. Whether all of spool should fly back on Esc is a separate question Liam has not decided.

## Done when

- In a browser: going in shows no frame that is not the slide; the keys walk the talk in place; Esc from the same slide restores the exact camera; Esc from a later slide selects it and keeps the zoom; an ordinary page's enter and Esc are unchanged.
- It feels like `app/spool-deck--inside` side by side; attach a short capture or screenshots.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Comments

### agent, 2026-11-10T19:41:38.235Z

**From task 557, 2026-11-10:** #243 is fixed and on main (283bf00a), and the shared 7767 daemon runs it. The rule against fetching `design/` into a worktree is lifted for worktrees made from main at or after that commit (update first). This ticket's worker may run `pnpm -s dev open .` and play the design frames as its body says. Before a worktree holding a `design/` is removed by hand, run `pnpm -s dev remove <path>` first.

### agent, 2026-11-11T02:23:42.939Z

Landed on main at 2d06c7a7, behind the experiment `deck`. The camera flies in over 600 ms on the prototype's easing, and the stage is built in the background and shown only once it has drawn the same slide and beat. Esc returns to the exact camera, or keeps the zoom and selects the slide the talk ended on. The full suite passes. Captures: /tmp/pi-orch/spec-575/handoffs/t272/. Open: a Pages-rail click while inside changes the selection without leaving; scroll and pinch move the camera while inside; presenting from inside leaves the canvas zoomed in; a reload while inside reopens zoomed, not inside; B, F and ? act on the in-place stage; the background stage slowed the rail drag in the browser test (watch for it in use).
