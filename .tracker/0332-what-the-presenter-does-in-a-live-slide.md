# #332 · What the presenter does in a live slide, the audience sees: clicks, scrolling, typing, hover and drags reach the room

- State: open
- Labels: ready-for-agent
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-13T12:21:56.203Z
- Updated: 2026-11-13T15:23:45.638Z

## Why

Liam, presenting to clients with live slides (prototypes he uses while he talks), 2026-11-13: "when presenting and we have 'live' frames sometimes it doesnt like reflect, also i dont know if scrolling on prototypes even work in presentations, but like if i do something in the 'control panel' while having a duplicated presenter window, it doesnt like reflect sometimes, i guess the state doesnt sync?" ("control panel" is the presenter view; the "duplicated window" is the room, the audience's screen.)

A scout traced it (2026-11-13, on main `9d4f5b85`). It is how it was built, not a regression:
- The room runs its own copy of the slide and receives only `ui.state`: a write in the presenter's stage becomes a whole-session update (`src/runtime/deck/stage.tsx:967-975`, `src/deck/stage-session.ts:87-89`), goes through the stage host's port (`src/runtime/deck/stage-host.ts:198-211`, `289-295`), the presenter broadcasts it on `spool-talk:<talk>` (`src/ui/deck/presenter.tsx:134-147`, `src/deck/present-wire.ts`), and the room seeds its copy with it (`src/runtime/deck/room-host.ts:110-139`, `stage.tsx:1020-1027`).
- Nothing else travels: not the click itself, not React `useState`/`useReducer`, refs, the scroll position of a scrollable element, hover, focus, what is typed in a field, a drag, `:hover`/`:active`, a video's position. The wire carries sessions, the pointer's dot and key commands only (`present-wire.ts:13-33`); the room shields its slide from pointer and focus (`room-host.ts:119-130`).
- So a prototype written the ordinary way reflects only the parts its author happened to put in `ui.state`. On the team canvas, `sys-alive/demo` stores the Sova screen but its route selection is `useState` (`shared/ui/demo/sova/prices.tsx:108,129`) and its night screen's scroll and progress are DOM state (`shared/ui/demo/sova/night.tsx:29-45,72`): those never reach the room. That is the "sometimes".
- Scrolling works in the presenter's own copy (an inner scroll container; the body does not scroll, `stage.tsx:1316-1328`), but the room does not follow it. With the button held, the wheel changes the pointer's colour instead of scrolling (`stage.tsx:1133-1142`, merge 645).
- One real bug found on the way: a slide put on ahead, out of sight, can write `ui.state` from a timer or a promise after its mount, and that write counts as the talk's (`wakingNow` guards only the synchronous mount, `stage.tsx:503-510`, `967-975`).

## What to build

**The room replays what the presenter does in a live slide**, so any prototype works as written and the audience sees what the presenter sees, without the slide's author doing anything. `ui.state` stays, and stays the authority for what it holds (it is what survives a reload and what a room that opens late gets).

- While a live slide is on show, the presenter's stage reports the presenter's input on it, and the room's copy of the same slide receives it: pointer movement over it (hover), press, release and click, drags, the wheel and the scrolling it causes, keys when the slide holds the keyboard (Tab hands it over today), text typed in fields, focus. The audience's copy ends in the same visible state: same screen of the prototype, same scroll position, same text in the field, same thing hovered.
- Choose the mechanism by a short spike and say why. Two candidates, possibly both:
  1. **In the stage's own runtime, in every browser**: capture trusted events in the presenter's stage document, send them on the existing wire with the target named so the other copy can find it (a stable path in the slide's DOM, positions as fractions of the slide's box since the two are drawn at different sizes), and re-create them there; mirror results where a made-up event cannot cause them (set the same scroll offset on the same element; set a field's value so React sees it; focus).
  2. **In the Mac app, real input**: the main process sends the same input to the room's window (Electron's `webContents.sendInputEvent`), confined to the slide's box, so hover styles, native controls and typing behave exactly.
  Whatever you choose must work in a browser tab as well as the Mac app, at least for clicks, scrolling, typing and keys.
- **Keep the two from drifting**: the room's copy starts from the same state as the presenter's when the slide comes on (both restart on arrival today, `stage-session.ts:109-118`); scroll positions and field values are corrected from the presenter's copy as results, not only replayed as causes; `ui.state` from the presenter overrides, as today. Say what can still drift (a slide that uses the time, random numbers or the network) and what the room shows then.
- **A room that opens late or reloads** on a live slide gets `ui.state` as today, and the scroll positions and field values of the presenter's copy if that is cheap; say what it cannot get.
- **Fix the bug above**: a slide not on show never writes the talk's state, whenever its write happens.
- **Scrolling**: say plainly in the skill how a prototype scrolls in a talk (an inner scroll container scrolls; held-button wheel is the pointer's colour), and make sure an ordinary wheel or trackpad scroll over a live slide scrolls it for both.
- **The skill** (`skill/topics/deck.md`, at its 12,000-character limit: replace the sentence "Whatever the room must see change on a live slide lives in ui.state" with what is now true, in as few words; follow the writing-for-agents skill).
- **Rehearse** (`spool rehearse`, #322): if it is cheap, one check that a live slide's copy follows (a click on the first control of the slide in one stage is seen in a second), so an agent hears when a live slide cannot be followed. Not required.

## Rules

- **Security**: the stage's document is untrusted and its messages can be forged by slide code. Input reported by a stage may only ever act inside the room's copy of the same slide: never on the trusted window, the room's own chrome, another slide, or outside the slide's box. Validate every message's shape where the wire is parsed (`present-wire.ts`, `stage-wire.ts`). If real input is sent in the Mac app, clip it to the stage's frame and send it only while a live slide is on show. Get an Opus reviewer's second look at exactly this (model `anthropic/claude-opus-5-5:high`) before merging, and say in the report what a hostile slide could do with the new messages.
- **Nothing gets slower**: Liam asked whether syncing costs performance. Stepping is being made lag-free by task 668 (#330), which is in the stage now (it holds the frames of slides at rest: a live slide on show in the room is never at rest). Pull main often, merge only as a fast-forward of the latest main after CI on that exact commit, and tell task 668 what you touch in `stage.tsx`. Events are small: the pointer already travels "light and often"; keep input on that path, not on the whole-session one. Measure: from the presenter's click or scroll to the room's paint, at most 50 ms; stepping numbers no worse than main (task 668's harness, `~/.brain-archive/deck-step/harness/`).
- The room stays shielded from its own mouse and keys as today (a click in the room's window is a talk command, not slide input).
- No change to what a non-live slide does.

## Done when

- A test talk with one live slide holding a counter in `useState`, a tab switch in `useState`, a long scrolling list, a text field, a hover card, a drag, and a second live slide after it: in a browser test with two stages (presenter and room), each of those done in the presenter's copy shows in the room's; a slide waiting out of sight that writes state from a timer does not change the talk's.
- On the m1 (take the screen with `~/.agent-hub/m1/slot`; `ssh m1` always with `timeout` and `-o ConnectTimeout=8`; real mouse, wheel and keys from the operating system, since events made through the debugging protocol prove nothing about a real hand), in the Mac app with the room on a second (virtual) display and in Chrome: the same, recorded side by side, with `sys-alive/demo` from the team canvas (route selection and the night screen's scroll must follow) and one Gust or Stilla demo. Recordings and the latency numbers in `~/.brain-archive/live-follow/`.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`; the full suite in CI as `AGENTS.md` says, never on devobee; a changeset (a minor); merged to main, not released (nothing is being released; main reaches Spool Beta by itself).
- A message to task 557 with what follows and what cannot, the latency, the reviewer's verdict, and the recordings' path. When it is merged, or before any choice the ticket does not settle, message task 557 (message_task) with a few lines. Put a time limit on every command that could wait for input. Close this task yourself once it is merged and reported.

## Comments

### agent, 2026-11-13T15:23:45.638Z

The merge line here is out of date: since spool#352 landed, builders merge with `ci-gate --land --input darwin=false` (see AGENTS.md), never by merging into main and pushing themselves.
