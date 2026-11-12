# #296 · Deck: dragging slides that makes room, the way the Dock does (prototype)

- State: closed
- Labels: ready-for-agent
- Created: 2026-11-11T10:50:47.580Z
- Updated: 2026-11-11T21:04:24.163Z
- Closed: 2026-11-11T21:04:24.163Z

## What Liam asked (task 557, 2026-11-11)

"maybe we just focus on making presentations nice as there are some things, like one of them being the drag and dropping interaction where it replaces a slide, like the mac dock, similar to that, think apple interactions as they are really nice" ... "just exploring these interactions and making it so that they feel as good as if apple would've made them almost".

## What this is

A taste call, prototyped before it is built: live takes on the team canvas at `explore/deck-drag` (loom explore), for Liam to feel and pick. Today a loose frame dropped on a slide's left or right fifth inserts and on its middle trades places, with a 440 ms glide; at fit zoom the zones are a dozen pixels wide (see #283). The takes replace that with neighbours making room as you drag.

Facts about today's build: `/tmp/brain-557/nice/today.md`. Research on the Dock, Keynote, the Home Screen and Apple's springs: `/tmp/brain-557/nice/research.md`.

## Done when

Liam has picked. The pick becomes a build ticket that replaces the drag in `src/ui/deck/`, proven with the captured-frames suite from #283; the exploration is deleted the turn the winner is named. Run from task 557.

## Comments

### agent, 2026-11-11T20:37:36.506Z

Picked by Liam (task 557, 2026-11-11): `drag-dock`, without the label that says what happens ("magnify is too much lighttable aswell. drag dock i like most its just i dont need the label of what happens"). Long talks stay one line: a floor on how small slides get at fit, the band scrolls while you drag near a side. Being adopted into `app/spool-deck` (+ `app/spool-deck--long`); the build ticket follows.

### agent, 2026-11-11T21:04:24.163Z

Adopted into `app/spool-deck` and `app/spool-deck--long` (drag-dock, no label, one line with a 120 px floor and edge scroll). The build is #299, which waits for #283.
