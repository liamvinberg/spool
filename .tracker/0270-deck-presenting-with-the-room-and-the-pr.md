# #270 · Deck: presenting with the room and the presenter view

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Blocked by: #269, #243
- Created: 2026-11-10T17:59:12.484Z
- Updated: 2026-11-11T01:14:26.306Z
- Closed: 2026-11-11T01:14:26.306Z

## Parent

#265 (the spec; read it first, then ticket #255's resolution for what was decided and turned down)

## What to build

Presenting. From the canvas, ⌘↵ presents from the selected slide and ⇧⌘↵ from the first: spool's window becomes the presenter view and the room opens as a second window. The two move together. Ending returns to the canvas with the current slide selected.

Read the spec's "Presenting", and play `app/spool-deck--presenter` and `app/spool-deck--present` on the team canvas: they are the reference for layout, parts, copy and motion. Follow them literally.

- The presenter view hosting the stage as the one authority: the clock, the room's name with its cues, the live slide, the next beat, the beat's name, count and notes, the bar per slide with a clickable segment per beat, freeze, black, restart, help, End. Broken and loading slides are named beside their bar.
- The room's window hosting the stage as a follower: no chrome, no cursor, the soft pointer dot over a live slide, black and frozen as its states. In a browser it goes full screen on the first key or click in it.
- Numbered absolute snapshots from the presenter over a broadcast channel on the window's origin; the room asks for the newest on opening and on reload; the slide's `ui.state` rides in the snapshot.
- Tab hands the keyboard to a live slide and Esc takes it back, with the cue the design draws.
- The room closed mid-talk is said in the presenter view and offered again. Closing or reloading spool's window ends the talk and closes the room.
- A minimal way in until the canvas ticket lands: the two keys on a deck page. The label's play slot and the row's action come with the canvas tickets.

## Where to start

The stage from the previous ticket. How play windows open today (`window.open` from `src/ui/canvas/canvas.tsx`; the Mac app intercepts it in `desktop/src/main.ts`, which this ticket leaves alone, so in the Mac app the room is an ordinary play window for now). The window's hotkey register (`src/ui/hotkeys.ts`). The prototype's `presenter.tsx` and `audience.tsx`.

## Leave alone

The Mac app (its ticket follows). The canvas's own keys when nothing is entered, beyond the two new ones.

## Done when

- The browser suite gains: two windows on the same slide and beat through a long random walk of commands, a room reload, freeze then release; a live slide's `ui.state` change shows in the room; a broken slide is named in the presenter view while the room keeps its picture.
- The presenter view matches the design frames side by side; attach the screenshots to the handoff.
- With the experiment off the two keys do nothing.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Comments

### agent, 2026-11-10T19:41:38.209Z

**From task 557, 2026-11-10:** #243 is fixed and on main (283bf00a), and the shared 7767 daemon runs it. The rule against fetching `design/` into a worktree is lifted for worktrees made from main at or after that commit (update first). This ticket's worker may run `pnpm -s dev open .` and play the design frames as its body says. Before a worktree holding a `design/` is removed by hand, run `pnpm -s dev remove <path>` first.

### agent, 2026-11-11T01:14:26.306Z

Landed on main at a7b0b777, behind the experiment `deck`. The presenter view is the one authority and sends absolute snapshots to the room over a BroadcastChannel; the room is the deck's play address with `?room=`. The browser suite covers a 40-step random walk with a room reload, freeze and black, `ui.state` in the room, Tab and Esc, a broken slide named in the presenter view, and the closed room offered again. Screenshots: /tmp/pi-orch/spec-575/handoffs/t270/. Open: the room's letterbox is pure black where the frames' ground is #0a0a0b (a one-line change); "Studio Display" and Swap belong to #273.
