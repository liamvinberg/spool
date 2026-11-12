# #298 · Deck: Present plays at once, full screen on one display, with a caret for the other way

- State: open
- Labels: ready-for-agent
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T21:02:25.446Z
- Updated: 2026-11-12T01:09:34.911Z

## What Liam asked for (task 557, 2026-11-11)

"playing immeduately like opens a new window with the presentation and your \"control panel\" like presenter mode, but like figma has so you can choose if you just want maybe one fullscreen maybe from your machine you present" and "making it so that they feel as good as if apple would've made them almost". He picked the take `present-caret` from four live takes (#297) and named the pointer dot on live slides as the thing he liked.

## What is wrong today

Decks ship behind the experiment `deck` (spec #265). Present (⌘↵, the ▶ on the deck's row in Pages, "play" on a slide's label) always turns spool's window into the presenter view and opens the room as a second window. On one display that window is a 960×540 popup that nothing makes full screen in the Mac app, and in a browser needs to be dragged somewhere and pressed. There is no way to simply show the slides full screen from the window you are in, and no Present button on the canvas.

## What to build

**Present plays at once, and spool decides how from the displays.**

1. **A Present control on the canvas**, top right of a deck page: `Present` with a caret. Present starts the talk the way described below. The caret opens a menu of two rows in a fixed order, "Full screen" and "Presenter view", each with a small drawing; a check and ⌘↵ sit on the way Present will take, ⌥⌘↵ on the other. ⌘↵ and ⌥⌘↵ work from the keyboard too. ⇧⌘↵ still starts from the first slide, and the ▶ in Pages and "play" on a slide's label go through the same Present.
2. **One display: the slide fills this screen.** The slide grows from its card on the canvas until it fills the screen, with spool's own window made full screen: in a browser by asking for full screen in the Present press itself (that press is the gesture the browser needs); in the Mac app by spool's window covering the display at once, without macOS's slide-to-a-new-Space animation (try simple full screen first; the slide growing must be the only motion). There is no room and no second window. The stage is the same stage engine the deck already has, hosted in spool's window, which stays the one authority.
3. **The bar, on one display.** A moving pointer wakes a small bar near the foot: previous, "3 of 5", next, Notes, End. The first move only records where the hand is; a move of 6 px or more from there wakes the bar; less changes nothing. It goes 1.8 s after the hand rests and stays while the pointer is on it. The pointer is hidden while the bar is asleep. Notes opens a peek of the current beat's notes while hovered, and a press pins it. Esc unwinds in order: a live slide holding the keys, a pinned Notes, then the talk ends.
4. **Two displays: the presenter view, by itself, always.** As today: the room opens on the other display and this window becomes the presenter view. Mac app: no press needed (today's behaviour). Browser: two displays are known only where `screen.isExtended` is true; then the room is today's popup, which needs its one press to fill its screen. Where the browser cannot tell, it is treated as one display. With two displays the caret's "Full screen" plays that way once and is not remembered.
5. **The caret's Presenter view on one display** is today's behaviour: this window becomes the presenter view and the room opens as an ordinary window beside it, for sharing in a call. Do not move or resize spool's window for it (the design frame draws spool's window scaled aside; that is not built).
6. **On one display the last way used is remembered**, per machine (not in the project): full screen the first time; a way chosen from the caret or by ⌥⌘↵ becomes what Present does next time, and the menu's check follows it.
7. **Ending** (End, Esc, or the browser leaving full screen, which ends the talk): the slide flies back to its card and the canvas is where it was, with the slide the talk ended on selected, as today.
8. **The pointer dot stays as it is**: the soft dot the room shows while the presenter's pointer is over a live slide. Full screen on one display has no room, so no dot.

## The motion, from the design

- One spring for everything that moves: duration 0.5 s, bounce 0, always restarted from where the thing is now. Esc during the way in, or ⌘↵ during the way home, turns it round from where it is. It lands once.
- The black behind the slide fades in over 0.34 s and out over 0.3 s, cubic-bezier(0.22, 0.61, 0.36, 1). The card's corner radius goes to 0 as it fills the screen.
- Handover so nothing blinks: on the way home the card is shown under the slide first, then the slide fades over 160 ms. A slide whose picture is not on screen yet waits before it flies rather than flying blank.
- The bar: in 180 ms; out 400 ms with a 6 px drop; 40 px tall, 64 px above the foot. The Notes peek: 440 px wide, opens over 140 ms, closes over 180 ms from scale 0.97, 160 ms grace on leaving.
- The caret's menu: 376 px, opens over 140 ms and closes over 90 ms from scale 0.97, anchored top right. Present presses down to 0.97.

The design is on the team canvas (`pnpm -s dev open .` fetches `design/`; read `design/AGENTS.md`): frames `app/spool-deck` (Mac app, one display), `--browser`, `--displays`, `--displays-browser`, `--slides` (full screen with the bar up), `--present-menu`, `--room-window`; code in `design/shared/ui/spool/deck/present.tsx` (the player and every timing), `present-controls.tsx` (Present with its caret, the bar), `present-geometry.ts`. Follow it literally for look and timing; build chrome from `src/ui/primitives/`.

## No flicker, proven

Liam reported flicker in the first deck build (#283, being fixed in task 598: pull main often and do not redo its fixes). The canvas draws slides as GPU pictures and the stage draws live documents (`src/ui/canvas/frame-shell.tsx`), so the moment a picture hands over to the live slide, and back, is where a blink would be. Prove on captured frames, in the manner of `src/daemon/deck/stage-browser.test.ts` and the suite #283 adds: Present on one display, reversing mid-flight, stepping slides, ending. No blank frame, no picture swapped back, no position reversed. The stage's existing limits stand (the next slides rendered out of sight, at most two WebGL contexts kept).

## Where to start

`src/ui/deck/present.ts` (how Present starts today, the popup), `presenter.tsx`, `deck-rail.tsx` and `src/ui/canvas/frame-label.tsx` (today's two controls), `src/runtime/deck/stage.tsx`, `stage-host.ts`, `room-host.ts`, `src/runtime/deck-stage-host.ts` (a single window owning the session already exists at `/play/<project>?deck=<page>`), `src/deck/stage-keys.ts`, `desktop/src/main.ts` (around the popup interception) and `desktop/src/room.ts`, `src/settings/registry.ts` for the remembered way, the toolbar in `src/ui/canvas/canvas.tsx`.

## Leave alone

The presenter view's content and keys (B, X, F as they are). The room. The exported HTML and PDF. `/play/...?deck=`. Dragging on the deck page (another ticket). Everything outside the experiment `deck`.

## Done when

- In a browser and in the Mac app, with one display: Present fills the screen with the slide grown from its card, the bar wakes and sleeps by the rules above, the talk steps, and End or Esc flies the slide home. With two displays: the presenter view and the room, with no question.
- The caret's menu takes the other way; on one display the choice is remembered across a restart.
- The captured-frames test passes; today's deck suites pass.
- **On the m1, in the Mac app built from your branch** (the `m1` skill; `desktop/README.md`): present a real deck on the built-in display both ways, record the screen at 60 fps, and go through the recording of Present, a reversal and End frame by frame. Say what you saw. A second display can be faked with the virtual display tool noted in `~/.brain-archive/release-run/` on devobee.
- `pnpm test:changed`, then the full `pnpm test`, `pnpm typecheck`, `pnpm check`. A changeset. Merged to main with CI green. Do not release.
- Redraw nothing on the canvas unless the build had to differ from a frame; then say where.
- A message to task 557 with what was built, what differs from the design and why, and where the recordings are. Bring any choice this ticket does not settle to task 557 before building it.

## Comments

### agent, 2026-11-12T01:09:34.911Z

Judged in task 557 from the m1 recordings: the flight, the bar and the reversals are right. Three follow-ups went to #306: the Dock over the slides, about 200 ms dead at the press in the Mac app, and the room's window opening black for 0.7 s.
