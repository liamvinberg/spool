# #315 · Show pointer: the room's menu in the presenter view

- State: open
- Labels: enhancement, ready-for-agent
- Created: 2026-11-12T11:39:28.798Z
- Updated: 2026-11-12T11:39:28.798Z

## What this is

A talk gets one setting, **Show pointer**: whether the room sees the presenter's pointer as a soft dot over a live slide. Today the dot is always on. The setting is reached in the presenter view, from the room's name at the top right, which opens one small menu. Liam picked this on the canvas on 2026-11-12 (task 631, question `deck-settings`, winner `settings-room`).

His words: "some settings in some clean way ... so you can toggle the cursor indicator when you are in a presentation ... i just want it clean without bloating spool". His bar is that nothing is added to spool's everyday surface.

## What was decided, and why

- **One setting, no more.** A countdown, the notes' text size, looping, auto-advance and slide numbers were weighed and turned down: in Keynote, PowerPoint, Google Slides and Figma, presenters mid-talk reach for moving, blacking the screen, pointing and the clock, and the rest is set once and forgotten. Do not add a second setting, a settings panel or a section in Settings.
- **Remembered on this machine, on by default, never in `deck.json`.** It is the presenter's habit, not part of the talk: a teammate presenting the same deck keeps their own. Add `present.pointer` beside `present.way` in `src/settings/registry.ts` (scope `machine`, group `remembered`, boolean, fallback `true`), so it has no row in Settings, and read and write it the way `present.way` is (`src/ui/deck/present.ts`).
- **Off means no dot anywhere.** The room never sees it, and the presenter's own view of the room (the right-hand column while a live slide has the keys) shows none. Her real pointer is untouched.
- **The switch is on the sender's side.** While it is off, whatever sends `{ kind: "pointer" }` to the room (`src/ui/deck/presenter.tsx` near line 150, `src/ui/deck/present-slides.tsx` near line 634) sends `at: null`, and turning it off sends one `null` at once so a dot already drawn goes. Why: the room then needs no new state, nothing to replay when a room window asks again, and a room window from an older build still behaves. Leave `src/runtime/deck/room-host.ts` and the wire in `src/deck/present-wire.ts` as they are.
- **L flips it**, as a talk key in `src/deck/stage-keys.ts`, wherever there is a room to send the dot to, and not while a live slide has the keys (then every key is the slide's, as today). The key list (`src/ui/deck/key-list.tsx`) gains "Show pointer · L" as the last row under room, shown where the room's other keys are.
- **The room's menu.** In the presenter view's head the room's name (`room · Studio Display`, `room · window`) is already a button. A press now opens one small popover under it, right-aligned, built from the primitives in `src/ui/primitives/`:
  1. a row "Show pointer", under it "The room sees a dot where you point.", then the key `L` and a switch. The whole row flips it.
  2. a separator.
  3. the screen the room is on: with two displays, both by name in a fixed order, a check on the room's and the key `X` on the other, and a press on the other swaps exactly as X does today; with one display, a single checked row `window`. When the other display's name is not known (a browser, or a Mac app older than this change), its row reads `other screen`.
  
  Flipping the switch or picking a display leaves the menu open so the change is seen. Esc, the room's name again, or a press anywhere else puts it away; Esc with the menu open closes the menu and does not end the talk; a press outside still reaches a live slide. When the room's window is closed the name still reads "open it again" and reopens it, with no menu.
- **L says what it did.** With the menu closed, L puts one cue where the black and frozen cues stand, beside the room's name, for 1.8 s: "The room sees your pointer" or "The room doesn't see your pointer", with the key `L`. The closed, unplugged, black and frozen cues win over it. Nothing stays lit while it is off: it is a preference, not a state to undo.

## Turned down, do not reopen

- A key alone with nothing to press, a word in the room line that is the switch, a line in Present's caret menu on the canvas, a row in Settings (under Decks or under the Deck extension). 
- Anything on the canvas, the tool bar, the Properties pane or over a slide.
- Storing it with the talk.

## The design to match

The adopted frames are on the team canvas (`design/`, fetched by `pnpm -s dev open .`; read `design/AGENTS.md` first): `app/spool-deck--room-window-menu` (one display, the menu open) and `app/spool-deck--presenter-menu` (two displays), with the row in To build that names this ticket. Their code is the reference for layout, words, sizes and motion: `design/shared/ui/spool/deck/room-menu.tsx`, and the changes in `presenter.tsx`, `present.tsx` and `keys.ts` beside it. Play them: move the pointer over the phone, press L, open the menu. Follow them literally; where the product's primitives differ from what the frame used, the primitives win and you say so in your report. When the code matches, remove the To build row and leave the frames.

## Done looks like

- Presenting with the presenter view: the dot shows as today; L or the menu's switch takes it away in the room and in the presenter's view of the room at once, and brings it back; the choice is still there the next talk and after a restart.
- The menu opens from the room's name on one display and on two, lists what is described above, swaps on a press, and closes on Esc without ending the talk.
- The key list shows the row; the 1.8 s cue shows on L.
- Tests, each at the cheapest level that proves it: the key in `stage-keys.test.ts`, the setting's default and gating as a function, and one case added to an existing presenter browser test (`src/daemon/deck/present-browser.test.ts` or `stage-browser.test.ts`) proving that off, the room draws no dot. Extend cases before adding files.
- `skill/topics/deck.md` says in a clause, where it tells a person how to present, that L turns the room's pointer dot off and on.
- A `minor` changeset ("**Show pointer.**" ...), per `docs/releases.md`.
- `pnpm test:changed` as you go, then `pnpm test`, `pnpm typecheck`, `pnpm check` once at the end.

## Leave alone

- `src/ui/deck/present-controls.tsx` and the canvas's top right row: task 627 is rebuilding them (#312).
- `desktop/`: task 621 is building a native module for presenting there (#309). If the other display's name can only come from a change in `desktop/`, ship the `other screen` fallback and say so in your report rather than editing it.
- The dot's look and timing, `deck.json`, spool's Settings pages, and the release pending in task 557.

## How to work

Put a time limit on every command that could wait for input. The 7767 daemon is shared: never stop it; take a lane if you need your own. Before any choice this ticket does not settle, and with a few lines when you are done, message task 631 (message_task). Merge when the checks pass, then close your own task.
