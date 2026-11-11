# #264 · play: choose the size a frame plays at, by pulling its edge or from a menu on the size

- State: open
- Labels: enhancement, ready-for-agent
- Created: 2026-11-10T12:40:19.717Z
- Updated: 2026-11-10T12:40:19.717Z

## What Liam wants

In Play he wants to choose the size a frame plays at (a landing at phone width, a phone screen on a tablet) and get back, without dragging the whole window around. spool#263 made Play show a frame at its own size with the size always in the middle of the bar; this adds changing it. Explored on the canvas in task 565 (`play-size`: menu, drag, type); he picked **drag combined with the menu**.

## The design is drawn: build it to match

Four frames in the team canvas (`pnpm -s dev open .` fetches `design/`), playable, listed under To build in `design/AGENTS.md`:

- `app/spool-player--size`: at rest, fully playable (drag, double-click back, menu, Window, As drawn)
- `app/spool-player--size-menu`: the list open, previewing Phone
- `app/spool-player--size-drag`: mid-pull, holding at the phone stop
- `app/spool-player--size-narrow`: the Mac window hugging a 390 × 844 frame

Their code is `design/shared/ui/spool/player-size.tsx` and `player-size-model.ts` (plus two optional props on `TopBar` in `viewer-player.tsx`). **Port the model's rules and numbers literally** (devices, grab and reveal distances, snap, stretch, springs, fades, dwell, type-ahead, menu gap and width: all named constants at the top of `player-size-model.ts`). Play the frames before building; where this ticket is silent, the frames decide.

## What was decided

**One control, two ways in.**
- **Menu.** A click on the bar's readout opens a short list under it: As drawn, Window, then Phone 390 × 844, Tablet 834 × 1194, Laptop 1440 × 900, Desktop 1920 × 1080, each with its size. Resting on a row previews that size behind the list; click or enter keeps it; esc or a press outside puts the frame back. Arrow keys, Home/End, type-ahead. The row the frame is at is marked; at a dragged size that matches no row, none is.
- **Drag.** Near the played frame's edge, out on the desk, a grip appears. Pulling an edge or corner resizes the frame from its centre, laid out for real at that size. The readout counts live. The pull holds softly at the device sizes and the frame's own, and the bar names the stop while it holds. Pulled to the window's edge it lets go into Window. A double-click on an edge springs back to the frame's own size.
- Nothing sits on the frame itself: it keeps every click and scroll.

**Settled:**
- The click on the readout no longer flips fit and responsive. Window in the menu replaces responsive, the bar's word becomes `window`, and Window is the whole room (`W × R`), no longer capped at the frame's authored width: As drawn is one click away for that.
- No return arrow and nothing else added to the bar. Back is a double-click on an edge, or As drawn.
- The readout is one line, size first: `390 × 844`, then what it is at when that is a device or the window (`390 × 844 · phone`, `1440 × 870 · window`), then the percent when drawn smaller. Dead centre, as spool#263 left it.
- Any size bigger than the room shrinks to fit, by spool#263's rule (`player-fit.ts`).
- **What is remembered:** As drawn or Window per machine, as today (`spool:player-fit`, keep the stored values readable). A device or dragged size is never stored: it holds while this play is open, across walks to other frames of the flow, and a new play starts as drawn.
- **Under 520px** of window width the readout stays (it is the only way to the menu), without the device word; the project name goes as today and the frame's name truncates. No desk, so no grips.
- The Mac app's window is left alone: it does not grow or shrink to a chosen size.
- esc is unchanged. No typing a size, no key hints (the `size-type` take was turned down: more in the bar, and it changed what esc does).
- While recording at a clip's shape there is no size control, as today.

## Where to start

- `src/runtime/player-fit.ts`: `fittedBox`/`fittedScale` and the stored pick. The played size becomes one of as drawn, window, or a given `w × h`; put the pure rules (stops, holds, which row is marked, what the readout says) here or beside it, unit-tested.
- `src/runtime/player-chrome.tsx` and `player-chrome-css.ts`: the bar's middle (`.spool-bar-fit`, `TopBar`), the screen box, the desk. The menu and grips belong to the shell, outside the frame's iframe.
- `src/runtime/player-shell-runtime.tsx` `playedBox`: the box sent across the port must be exactly the iframe's box at every moment of a pull or a preview, or the reveal wedges shut (see its comment).
- `src/runtime/player-page.ts` `barLayout`: the under-520 rule.
- `src/ui/viewer/viewer-player.tsx`: the viewer's player and shared links get the same control.

## Watch

- A pull crosses the iframe: the frame's document swallows pointer events, so hold the pointer for the length of a pull (capture, or a cover over the frame while pulling) and release it after. A double-click on the desk must not select text in the frame.
- Reflowing an iframe on every pointer move is the cost here: keep a pull smooth on a heavy frame, and say in the report what you did.
- Touch has no hover: on a touch screen the menu is the way in, and grips need not appear.
- The white-line fix of spool#263 (the backing stops a pixel short) must still hold at the take's 1px ring round the frame.

## Leave alone

- Recording and its shaped boxes, the Mac app's window sizing and remembered rectangles (`desktop/`), spool#263's screen-or-page rule.

## Done

- Playing `app/spool-player--size` next to the built player, the two behave the same: drag, stops, double-click back, menu preview and pick, Window, As drawn, narrow window.
- Works in the play tab, the Mac app's play window and the viewer's player.
- Unit tests for the pure rules; one browser case proving the wiring (pick Phone and the frame's own `innerWidth` is 390; pull an edge and it changes; double-click and it is back).
- A changeset (minor) in plain words; the To build row for these frames removed from `design/AGENTS.md` once the code matches, and `app/spool-player` and its states redrawn where the bar changed (the caret, `window`).
- `pnpm test`, `pnpm typecheck`, `pnpm check` pass.
