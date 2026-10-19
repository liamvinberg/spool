# #129 · Core: one engine for kinds of creative work, presentations first

- State: open
- Labels: ready-for-human
- Created: 2026-10-18T17:43:56.645Z
- Updated: 2026-10-18T17:43:56.645Z

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
