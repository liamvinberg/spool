# #289 · New window: changing the canvas, and the services extensions get

- State: open
- Labels: ready-for-agent
- Parent: #284
- Blocked by: #285, #287, #288
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T10:15:03.764Z
- Updated: 2026-11-11T10:15:03.764Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The new window can change the canvas, and hands the same powers to extensions as services.

Read the spec's "The line" and "Services in this spec". In short:

- **Moving and resizing** frames with snapping and guides, preview then commit, alone and many at once; arranging (the arrows and Tidy); a page kind's `policy` will be able to switch guides, gap snapping and handles off, so build them switchable.
- **Structure**: create, copy, move to another page, rename, trash, restore, reorder, each one transaction with one undo receipt. The daemon's structure operations gain the **references** slot: on rename, move, trash, restore and copy, core calls every participant's `find` and `rewrite` inside the same write, and one undo reverses all of it.
- **Hand edit**: picking elements in an entered frame, editing by hand, landing through the write lane, as today.
- **One undo stack** for all of it. `undo.record(entry)` puts an extension's own entry on it.
- **`writes.plan(planner)`**: an extension plans the characters; core keeps the stamp and boundary checks, the landing and the undo patch.
- **Frames at run time**, as services: document events (reloading, loaded, arrived, error, gone), post to a frame part, reload, measure, capture and freeze leases.
- **Session** (per-page state a walk or a talk carries), **changes** (core's stream, and `publish` from a daemon part to its window part), **memo** (derived data cached by core's per-frame hash), **storage** (an extension's declared files in `design/`, and per-machine storage), **notify**, **play**.
- **Motion** is held to the standard in the spec's "The new window": a still or trembling hand changes nothing, a drop settles once, no picture is swapped by a move, a write, a selection or an undo. Extend the captured-frame test to drag, drop, resize and undo.

Prove the services through the test kit with fixtures, and the references slot over a fixture `design/` in the daemon.

## Decided

- An extension never writes a frame's source or geometry except through these services. `writes.plan` and the structure transaction are the only doors.
- Core's refusal codes stay a closed set; an extension's own are strings under its id.
- A participant in a structure transaction can rewrite; it cannot refuse the action. If its rewrite fails, the transaction fails whole and says which participant.

## Where to start

Today's code, to be checked: `src/daemon/geometry.ts`, `hand-lane.ts`, `hand-write.ts`, `hand-routes.ts`, the structure operations in the daemon (and how flows' `go` targets are rewritten on rename today, in `src/daemon/flows.ts` and around it: that special case is what the references slot replaces in a later ticket), `src/ui/canvas/snap.ts`, `arrange.ts`, `hand-edit.ts`, `use-hand-edit.ts`, the undo stack (`canvas-undo.test.ts` names it), `stillness.ts`. The deck's `src/daemon/deck/journal.ts` and `keeper.ts` show a change applied whole. The spike's `core/window/writes.ts` and `core/daemon/structure.ts`.

## Leave alone

Today's window. Flows' rewrite on rename stays as it is until flows moves.

## Second review

Beside the standard review, an Opus reviewer (`anthropic/claude-opus-5-5:high`) reads this for lost work: a structure action or a write that fails part way, an undo that reverses only part of a step, a rewrite racing a save from an agent or a teammate.

## Done when

- The hand-edit, move, multi-select, structure and undo browser suites of today's window pass against the new window by the switch in the test setup, unchanged. Add them to the parity list in the handoff.
- A fixture participant's names are rewritten on rename, move, trash, restore and copy, and one ⌘Z reverses each whole.
- A fixture's planned write lands, is refused when the source moved under it, and undoes.
- The captured-frame test covers drag, drop, resize and undo.
- Every existing suite passes untouched. `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.
