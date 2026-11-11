# #267 · Deck: beats, live slides, notes, and the guide for agents

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Blocked by: #266
- Created: 2026-11-10T17:59:11.866Z
- Updated: 2026-11-10T19:50:50.976Z
- Closed: 2026-11-10T19:50:50.976Z

## Parent

#265 (the spec; read it first, then ticket #255's resolution for what was decided and turned down)

## What to build

A slide can name its beats and be live, it has notes, and agents know how to write a deck.

- `ui.beats(names)` and `ui.live()` on the `spool` import, as the spec's "Slides in code" defines them: types, the runtime, and the fallback (the last beat wherever nothing is stepping the slide, which today is everywhere). The stepping itself arrives with the stage; build the runtime so a host can set the beat.
- The daemon reads a frame's beats and live flag from its source without running it, and the deck read gains them per slide.
- Notes: the deck read gains each slide's notes by beat from `notes.md`, and one operation writes a slide's notes for a beat, with undo, creating and removing the file as needed.
- The `deck` topic in `spool skill`, shown when the experiment is on, and the `spool check` rules, both as the spec's "For agents" lists them. `check` has no experiment context today; wire one through.

## Why

The beats list has to be a literal because the rail, Properties and the presenter view need a slide's beats before it has ever mounted. Notes live in a file beside the frame, not in `deck.json`, so they travel with the frame through duplicate, move, trash, history and sync for free, and an agent writes them as plain text.

## Where to start

How `ui.knobs` came to exist is the model for a new call: its types in `src/runtime/spool-public.ts`, its runtime in `src/runtime/frame-runtime.ts`, and the daemon reading its call from source in `src/daemon/knob-literals.ts`. Beats need no compile-time stamp: nothing writes back into the call. Skill topics are files under `skill/topics/` with an `experiment` line in their frontmatter (`src/skill.ts`). Check's diagnostics are in `src/check.ts`.

## Leave alone

Knobs. The player's navigation. The canvas.

## Done when

- A frame calling `ui.beats(["a","b","c"])` on the canvas, in a still and in ordinary play shows its last beat, and typechecks in a project.
- Over a fixture: the deck read lists each slide's beats, live flag and notes by beat; a notes write round-trips and undoes to the exact bytes; a non-literal beats list is a problem in the read and an error in `check`.
- `spool skill deck` prints the guide with the experiment on and is absent from the index with it off.
- An agent given only `spool skill deck` writes a three-slide deck in a scratch project that passes `spool check` and is laid out by the daemon. Say in the handoff what the guide had to gain for that to work.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass; a changeset is added.

## Comments

### agent, 2026-11-10T19:50:50.976Z

Landed on main at 54ddd300, behind the experiment `deck`, with the changeset. An agent working from `spool skill deck` alone wrote two three-slide decks that pass `check` and were laid out by the daemon. Open: `spool shot` can only show a slide's last beat (a beat option would help agents check reveals); the guide already lists the presenting keys, which #269 keeps or edits.
