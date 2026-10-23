# #129 · Core: one engine for kinds of creative work, presentations first

- State: open
- Labels: ready-for-human
- Created: 2026-10-18T17:43:56.645Z
- Updated: 2026-10-22T07:18:55.042Z

## Why

[spool.page](http://spool.page) says "a deck is frames too", but spool has no way to present. Liam wants presentations first. Later, other creative work could follow on the same foundation instead of in separate apps: marketing films, launch kits, key art. Agents can already make the impressive part (three.js, shaders, motion). What's missing is everything around it.

## What the explorations found (agent-hub task 126)

There are eight takes on the team canvas ([spool.page/devosurf/spool](https://spool.page/devosurf/spool)), on pages `explore/present` and `explore/create`. They are probes, not designs to build. They kept running into the same missing pieces:

- **Order**: a path through frames. A page's flow already is one.
- **Notes**: what the speaker says on each frame, for example `notes.md` beside `frame.tsx`.
- **Present**: an audience view and a presenter view (current, next, notes, time) that move together. On Spool Cloud, viewers follow by link.
- **Transitions**: an element that keeps its identity from one frame to the next, like the Sola ring. You ask the agent for one in a sentence while pointing at two slides, rather than setting it in an inspector.
- **Clock**: frames that know the time, for films and timed talks.
- **Pointing**: a selection the agent can read that holds more: several frames, a moment in time, or a circled area.
- **Lineage**: new takes land under the take they came from.

One cost also showed up: many live WebGL frames at once hit the browser's limit, so frames off screen need to pause or show a still picture.

Lesson from round one: the deck's transition inspector was too much. The agent should do the craft. The person points at things and says what they want.

## The core, as a proposal

spool already is the engine: live TSX frames, the canvas, flows, the player, Cloud sync. A "kind" (canvas, deck, later film) adds three things on top of it:

1. a little metadata on a page: its kind, order and notes
2. the surface that opens it: the canvas, or a deck view of the same frames
3. what the player does on Present or Play

```
engine:  frames · canvas · flows · player · cloud sync · agents
kinds:   canvas (today) | deck (first) | film (later: + clock, export)
```

It works like Figma's file types, except one project could hold a deck page next to its prototype pages.

## First slice: presentations

- A page can be a deck: 1280×720 frames, in order.
- Notes for each slide.
- Present: an audience window and a presenter window.
- Transitions the agent writes from a sentence and the player plays, with shared elements beyond today's single view-transition-name.
- Following by link on Spool Cloud.

To keep in mind but not build yet: the clock, video export, lineage, and the richer pointing.

## To decide with Liam

- Is a deck a kind of page, a kind of project, or its own file or product?
- Is adding kinds purely additive, or do modules need to change (canvas, player, the daemon's project model)? Which ones?
- Where do notes live, and how does a person edit them?
- On the canvas, do a deck's slides always sit in a row, or can they be placed freely?
- How little UI can presenting get away with?

*From Linear DEV-280.*

Related: #133, #3

Duplicate of #1

Plane: SPOOL-129

## Comments

### agent, 2026-10-22T07:02:40.972Z

## From agent-hub task 201 (2026-10-20)

**Settled with Liam:**
- One spool, not a sibling product. Everything stays a live TSX frame (the agent writes code, not a format of ours).
- For people who work through a coding agent (designers who code, founders, developers making their own talks and launch assets).
- Presentations first, as lean and minimal as Figma Slides, with one spool twist: Enter steps inside a live slide.
- Nothing hardcoded deep: a small core, and a page picks how it plays (deck, print, film, or one an agent writes). Kits sit on existing libraries (motion, three.js), not a framework of ours.

**Round 1 takes** on `explore/kinds` (team canvas): `kinds-deck-rail`, `kinds-deck-field` (deck on today's chrome), `kinds-print` (wax seals, size plate, export at 300 dpi with bleed), `kinds-kit` (agent writes a film kit into `kits/film/`), `kinds-studio`, `kinds-stage` (rebuilt shell, paper or dark, spool's red). The rebuild takes lose side by side; the dock that changes with the kit and the agent bubble at the pointer are worth keeping.

**Where it went next:** Liam wants the core question first: a mod (plugin) system that can add panes, properties, page kinds and present modes, with presenting as the built-in mod that shows what it can do. A partial rewrite is on the table, using today's spool as the reference and cleaning up tests and tangled code on the way. Grilled in its own task.

### agent, 2026-10-22T07:18:55.042Z

## From agent-hub task 215 (2026-10-22): grilling the mod system, parked

Liam is parking this to grill with a newer model later. Pick up from here.

**Facts from the code (main at 0eda86e8):**
- Panes are already data (`PaneDef` in `src/ui/canvas/pane-window.tsx`, layout keyed by pane id), but all five are built inside `src/ui/canvas/canvas.tsx` (6,009 lines, ~260 hooks) from its local state. Hotkeys are a closed typed register (`src/ui/hotkeys.ts`).
- Properties (`properties-rail.tsx`) shows only frame.json geometry through a closed `Held` union. No sections to hook into.
- The player composes every frame of a project into one document on the render origin (`run.spool.localhost`) inside a trusted shell; its chrome runs in three hosts (daemon /play, Mac app, cloud viewer). It walks `data-go` links; Esc is its only key. The frame SDK (`src/runtime/spool-public.ts`) is 5 calls.
- Security line: frame code only runs on the render origin. The control origin holds the capability that drives the daemon, which spawns agents (ADR 0007). Team projects sync design/ to every teammate, so agent-written code in design/ can never run in spool's window.
- Two readers of design/: `src/daemon/projection.ts` (disk, writes) and `src/daemon/design-projection.ts` (pure; viewer, shares, spool-cloud). Pages are folders; page order and places are in `design/canvas.json`.
- Tangles: canvas.tsx 6k, team-sync.ts 3k, api.ts 2.6k, sidebar.tsx 2.2k, daemon app.ts 2.2k. Tests: 441 files, 110k of 253k lines.
- Figma Slides keeps the same four regions as Figma Design (canvas, two sidebars, toolbar). Slides sit on the canvas in rows (grid view), with a single-slide view to focus one. New primitives are only slide rows and slides; Figma Buzz is another file type on the same engine.

**Round 1 as asked, with recommendations:**
1. Who writes mods and where code runs: split. Spool's own code adds to the trusted window (panes, properties, keys); play modes (deck, flow, film, yours) are TSX on the render origin that agents can write per project and that sync and play on the cloud; a mode declares the fields it needs (notes: text) and spool draws them.
2. Rewrite or carve: recommended carving seams module by module (rewrite canvas.tsx into modules, Properties into sections, the player into modes, merge the two design readers; leave team sync, agent engines, compile, hand edits).
3. Deck first, with today's flow player moved onto the same seam at once, so the seam has two real users.

**Liam's leaning after round 1 (not settled):** a rewrite designed foundation-first, with spool itself built on its own SDK (built-in panes and modes are mods), presentations as the first official mod and other creative kinds as later official mods. Open: does that still feel like a canvas (recommendation: yes, as Figma Slides shows), and what the primitives are.

**Still to grill:** rewrite vs carve (his leaning vs the recommendation), the name (mod, kit, mode), how a page picks its mode, where notes live, what a mode is given, the presenter's second window, following on Spool Cloud, export, how agents learn to write a mode, the order of overnight runs.
