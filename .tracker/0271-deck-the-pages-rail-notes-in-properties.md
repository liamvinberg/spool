# #271 · Deck: the Pages rail, notes in Properties, and New presentation

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Blocked by: #267, #268
- Created: 2026-11-10T17:59:12.921Z
- Updated: 2026-11-10T22:33:58.964Z
- Closed: 2026-11-10T22:33:58.964Z

## Parent

#265 (the spec; read it first, then ticket #255's resolution for what was decided and turned down)

## What to build

The deck in the Pages rail and in Properties, and New presentation.

Play `app/spool-deck` and `app/spool-deck--new` on the team canvas and follow them literally.

- Pages rail: a deck page's icon and present action; its rows as the talk in order, a hairline, then the loose frames; rows drag along the talk to reorder and across the hairline to join or leave, each sending the same deck-change intents the canvas sends. Plain names only: no thumbnails, numbers or dots.
- Properties on a slide: the size section reads the talk's size as `all slides` and editing it sets the talk's size; a `notes` section with one field per beat, named by the beat, writing through the notes operation with undo. On a loose frame the size is its own.
- New presentation, beside New page: makes a deck page holding the five starter slides from the design as real frames that use `ui.beats`, in one daemon operation, opens it, and focuses the Agent composer with the hint "What's the talk about?". The composer has no hint today; add one to the request.
- The canvas-flow browser test from the spec's testing section.

## Where to start

`src/ui/canvas/sidebar.tsx` (rows, order, drag, the New page entry, `sidebar-menu.tsx`), `page-list.ts`, `order.ts`; `properties-rail.tsx` and how `KnobsSection` is mounted beside the geometry section; `askAgent` in `canvas.tsx` and `agent-composer.tsx` for the composer request; `src/daemon/explorer.ts` `createPage`. The starter slides are in the prototype's `starter.tsx` and `starter.css`; as shipped templates they must stand on their own, importing nothing from the team canvas.

## Leave alone

Ordinary pages' rows and Properties. The rail's stored order in `canvas.json`: a deck page's rows come from the deck read.

## Done when

- The browser walk passes: New presentation, drag a loose frame into the talk, trade, take one out, undo, write a note. (Going in and coming out joins this test in its own ticket.)
- With the experiment off there is no New presentation and a deck page's rows are ordinary rows.
- The rail, the notes section and the starter page match the design side by side; attach the screenshots.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Comments

### agent, 2026-11-10T19:41:38.220Z

**From task 557, 2026-11-10:** #243 is fixed and on main (283bf00a), and the shared 7767 daemon runs it. The rule against fetching `design/` into a worktree is lifted for worktrees made from main at or after that commit (update first). This ticket's worker may run `pnpm -s dev open .` and play the design frames as its body says. Before a worktree holding a `design/` is removed by hand, run `pnpm -s dev remove <path>` first.

### agent, 2026-11-10T22:33:58.964Z

Landed on main at d9c25790, behind the experiment `deck`. Screenshots are in /tmp/pi-orch/spec-575/handoffs/t271/. The browser walk stops before going in and coming out, which #272 adds. Open: the starter's number slide has two beats so the starter uses `ui.beats`; new decks are named `presentation`, `presentation-2` and added at the end; the notes label reads `notes.md`; New page (ordinary) selects the new page and doesn't open it, a bug outside this spec that was left alone.
