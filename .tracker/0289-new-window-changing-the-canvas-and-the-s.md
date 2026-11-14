# #289 · New window: changing the canvas, and the services extensions get

- State: closed (superseded by the ground-up rebuild, map #333)
- Parent: #284
- Blocked by: #285, #287, #288
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T10:15:03.764Z
- Updated: 2026-11-13T14:47:31.234Z
- Closed: 2026-11-13T14:47:31.234Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The new window can change the canvas, and hands the same powers to extensions as services.

Read the spec's "The line" and "Services in this spec". In short:

- **Moving and resizing** frames with snapping and guides, preview then commit, alone and many at once; arranging (the arrows and Tidy); a page kind's `policy` will be able to switch guides, gap snapping and handles off, so build them switchable.
- **Motion gets its writer** (spec, Services: Geometry and Motion). A preview is drawn through core's motion: it never writes a frame's standing place and never renders React per frame. Today's free drag does both (`canvas.tsx` around 4722), which is why this part is built new and not carried. Take the engine from `src/ui/deck/deck-motion.ts` (`createFrameSprings`: hold, steer, settle, stop, keep, and one animation loop for the springs, the steering and scrolling at the edge) by splitting its general part out where it stands, so the deck in today's window and the new window run one engine. A free drag follows the hand with no spring; a spring is for a page kind's drag and for a step that should travel. What #299 learned holds for every move: a drop counts the last pointer move that was not drawn yet; catching a frame that is still moving starts from where it is drawn; cancel and drop land by the same path; a commit keeps the frame drawn where it landed until the daemon's read agrees (`keep`, with its ends: a size change, the frame gone, four seconds); a refusal and an undo travel back and do not jump; a page change stops everything. Handles, guides and rings follow the drawn place. Extensions get it as the **motion** service: read, and steer.
- **Structure**: create, copy, move to another page, rename, trash, restore, reorder, each one transaction with one undo receipt. The daemon's structure operations gain the **references** slot: on rename, move, trash, restore and copy, core calls every participant's `find` and `rewrite` inside the same write, and one undo reverses all of it.
- **Hand edit**: picking elements in a frame and editing by hand, landing through the write lane, as today. Choosing Edit leaves the entered frame, and a borrowed Edit and open words each own input in their own way (Esc saves the words before it climbs anything): these are states of the input function from the surface ticket, so that a new rule from task 624 never means rebuilding this.
- **One undo stack** for all of it. `undo.record(entry)` puts an extension's own entry on it.
- **`writes.plan(planner)`**: an extension plans the characters; core keeps the stamp and boundary checks, the landing and the undo patch.
- **Frames at run time**, as services: document events (reloading, loaded, arrived, error, gone), post to a frame part, reload, measure, capture and freeze leases.
- **Session** (per-page state a walk or a talk carries), **changes** (core's stream, and `publish` from a daemon part to its window part), **memo** (derived data cached by core's per-frame hash), **storage** (an extension's declared files in `design/`, and per-machine storage), **notify**, **play**.
- **Motion** is held to the standard in the spec's "The new window": a still or trembling hand changes nothing, a drop settles once, no picture is swapped by a move, a write, a selection or an undo. Extend the captured-frame test to drag, drop, resize and undo.

Prove the services through the test kit with fixtures, and the references slot over a fixture `design/` in the daemon.

## Decided

- An extension never writes a frame's source or geometry except through these services. `writes.plan`, geometry, motion and the structure transaction are the only doors.
- Core's refusal codes stay a closed set; an extension's own are strings under its id.
- A participant in a structure transaction can rewrite; it cannot refuse the action. If its rewrite fails, the transaction fails whole and says which participant.

## Where to start

Today's code, to be checked: `src/daemon/geometry.ts`, `hand-lane.ts`, `hand-write.ts`, `hand-routes.ts`, the structure operations in the daemon (and how flows' `go` targets are rewritten on rename today, in `src/daemon/flows.ts` and around it: that special case is what the references slot replaces in a later ticket), `src/ui/canvas/snap.ts`, `arrange.ts`, `hand-edit.ts`, `use-hand-edit.ts`, the undo stack (`canvas-undo.test.ts` names it), `stillness.ts`, `frame-motion.ts`; for the motion engine and what calls it, `src/ui/deck/deck-motion.ts`, `spring.ts` and `deck-page.tsx` (lines 284 to 447: hold, land, refusal, undo). The deck's `src/daemon/deck/journal.ts` and `keeper.ts` show a change applied whole. The spike's `core/window/writes.ts` and `core/daemon/structure.ts`.

## Leave alone

Today's window. Flows' rewrite on rename stays as it is until flows moves.

## Second review

Beside the standard review, an Opus reviewer (`anthropic/claude-opus-5-5:high`) reads this for lost work: a structure action or a write that fails part way, an undo that reverses only part of a step, a rewrite racing a save from an agent or a teammate.

## Done when

- The hand-edit, move, multi-select, structure and undo browser suites of today's window pass against the new window by the switch in the test setup, unchanged. Add them to the parity list in the handoff.
- A fixture participant's names are rewritten on rename, move, trash, restore and copy, and one ⌘Z reverses each whole.
- A fixture's planned write lands, is refused when the source moved under it, and undoes.
- The captured-frame test covers drag, drop, resize and undo. A test proves a preview writes no standing place, and that a drop held over a stale read does not snap back.
- Every existing suite passes untouched. `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.

## Comments

### agent, 2026-11-13T14:47:31.234Z

Superseded on 2026-11-13: Liam decided to rebuild spool from the ground up in a new repo (task 634), so the new window is not built beside today's in this repo. The foundation is being decided on the map #333, and this page stays as evidence for its tickets (above all #350, the extension system on the new foundation). Nothing here was built.
