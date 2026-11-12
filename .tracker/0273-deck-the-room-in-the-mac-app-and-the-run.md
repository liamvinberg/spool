# #273 · Deck: the room in the Mac app, and the run-through on the m1

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Blocked by: #270, #271, #272, #275
- Created: 2026-11-10T17:59:13.580Z
- Updated: 2026-11-11T04:03:45.600Z
- Closed: 2026-11-11T04:03:45.600Z

## Parent

#265 (the spec; read it first, then ticket #255's resolution for what was decided and turned down)

## What to build

The room in the Mac app, and the proof that the whole thing works on a real machine.

- In the Mac app the room's window has no title bar and no bar of ours. With two displays it opens full screen on the one spool's window is not on, and X swaps the two; the presenter view shows the room's display by its real name. With one display it opens as an ordinary window.
- Ending the talk, quitting, or closing spool's window closes the room. Unplugging the second display mid-talk brings the room back as a window and says so in the presenter view.
- The run-through on the m1 (the m1 skill): in the Mac app, with a deck an agent wrote from `spool skill deck` alone, at least eight slides including a WebGL slide and a live slide, through every key in the table, going in and out on the canvas, Present, freeze, black, restart, the keyboard handed over and taken back, End. Screenshots of the room and the presenter view at each stage go in the handoff, with anything that glitched, flashed or lagged written down as it was seen, not smoothed over.

## Where to start

`desktop/src/main.ts`: where a play address is intercepted and its window made, the display reading it already does, and the bridge the play window uses (`src/runtime/player-page.ts`). `desktop/README.md` for building the app locally. The Mac app bundles the published package, so run it against this branch's build as the README describes.

## Leave alone

Ordinary play windows. Releasing the Mac app: build and test locally, release nothing.

## Done when

- The run-through passes on the m1 and its record is in the handoff. If the m1 has one display, say so, and prove the two-display placement with a test of the function that picks the display.
- Whatever the run-through found is fixed here when it is small, and listed as an open question when it is not.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass, and the full `pnpm test` once, since this is the last ticket.

## Comments

### agent, 2026-11-11T04:03:45.600Z

Landed on main at 3b5a5a7e. The run-through on the m1 in the Mac app built from the branch passed: 10 slides an agent wrote from the guide alone, with a WebGL slide and a live slide, every key, going in and out, Present, freeze, black, restart, the keys handed over and taken back, and End. The m1 has one display, so two-display placement is proven by tests of room-window.ts only. Its findings (the HTML export reaching esm.sh, blank WebGL slides in the PDF, the room covering the presenter view on one display, gaps in the guide) are being fixed together with the final review's findings. Record: /tmp/pi-orch/spec-575/handoffs/t273.md and t273/.
