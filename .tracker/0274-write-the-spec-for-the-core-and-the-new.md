# #274 · Write the spec for the core and the new window

- State: closed
- Labels: wayfinder:task
- Parent: #251
- Created: 2026-11-10T17:59:35.318Z
- Updated: 2026-11-11T10:15:14.879Z
- Closed: 2026-11-11T10:15:14.879Z

## Question

No decision left: this is the writing. Turn the map's decisions into the spec and tickets for stage 2 of the build order (the resolution on "What gets rebuilt, and in what order"): the SDK and extension host on every side, the canvas core written new behind an experiment, the first features moved onto it (Pages, Properties, knobs, flows, the deck), and the compile and sync reworks.

Inputs: the slot list ticket with its amendments from the spike and the deepseek-harness notes (extension-owned sub-slots, services an extension waits for, one handle that cleans up everything an extension started, enabled versus running), "What an extension is on disk", the spike's branch `567-wayfinder-map-251-ticket-259-a`, the engine research, the sync and compile audit, what building the deck (#265) taught, and the window designs Liam picked (#258) with what they need from the API (the last comment on the slot list ticket).

Written in the brain thread (task 557) when Liam says go. Resolved when the spec and its tickets are published.

## Comments

### agent, 2026-11-11T05:41:47.430Z

## What building the deck taught (task 557, after spec #265 landed)

- **The 1.5 s between `ui.go` and the next frame was the stylesheet request waiting on the daemon's compile.** The stage gets round it by rendering the next slides out of sight (React `<Activity mode="hidden">`) and readying fonts and pictures in the same document. The compile rework should make a frame's styles ready with its module, for ordinary play too.
- **A host-agnostic stage worked:** one piece (`mountStage`) hosted by the canvas, the presenter view and the room. That is the shape a play mode slot should have.
- **Whole changes through one daemon operation with a journal** (`src/daemon/deck/journal.ts`, `keeper.ts`) is what "takes part in a core transaction" needs to offer extensions.
- **The deck touches the old canvas only at call sites** (`src/ui/deck/`, `src/runtime/deck/`, `src/daemon/deck/`, `src/deck/`), so lifting it onto the core is a move, not a rewrite. The call sites are the list of slots it uses in practice: check them against the slot list.
- The builders' handoffs, with every file and API, are kept at `~/.brain-archive/spec-575-handoffs/`.

### agent, 2026-11-11T08:10:45.743Z

## Input routing is a core seam (task 557, from task 590)

Task 590 is rethinking how a person works with live frames ("windows": no entering; a frame at reading zoom is the app; Esc and cmd chords go to the frame first, then spool). In code it is one rule in one place for who gets the pointer, the wheel and each key between canvas, frame and stage, replacing the entered state spread through `canvas.tsx`, the frame shim's relay lists and the hotkey register's flags. The core spec takes that rule as its input-routing seam: a pure function to an owner, with the deck's stage as one owner (the talk outranks the slide for plain keys; PageDown and PageUp always move the talk; a prevented Esc stays with the slide). It is being built on today's canvas first, as a module the core inherits. Task 590 also owns the Esc fly-back pick (#276).

### agent, 2026-11-11T10:15:04.988Z

Written: the spec is #284, with tickets #285, #286, #287, #288, #289, #290, #291, #292, #293, #294. Not started: the build waits for Liam's go.

### agent, 2026-11-11T10:15:14.879Z

Resolution: the spec is #284 with tickets #285 to #294. The Esc pick (#276) and the input rule from task 590 are named in the spec as a seam; they fold in when task 590 reports.
