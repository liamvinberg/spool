# #292 · Flows as an extension

- State: open
- Labels: ready-for-agent
- Parent: #284
- Blocked by: #289
- Created: 2026-11-11T10:15:04.415Z
- Updated: 2026-11-12T12:02:20.329Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

Flows moves whole into `extensions/flows/`, and works in the new window.

- **Daemon part**: the flow graph and its routes under `/x/spool.flows/`, using the memo service so the graph is cached by core's per-frame hash; a **references** participant for `go` targets, which replaces today's special case in the structure operations; the agent guide topic and the check rules that are about flows.
- **Frame part**: `ui.go` and `ui.back`, with their fallback (they do nothing when nothing is listening), and the walk state through the session service.
- **Window part**: the arrows as a layer in canvas space, the marks on frames as decorations, the commands (and their keys and menu places), and whatever else today's window shows for flows. The arrows read frames as drawn (the motion service), so they keep following a frame while it is dragged, as they do today, where a drag still writes the standing place.
- Today's window is repointed at the new routes and otherwise untouched.
- Flows' tests move with the code.

## Decided

- One implementation of the daemon and frame parts; only the window part exists twice until stage three.
- The player keeps walking flows exactly as today; the `spool` module it gets is built from core plus the official frame parts.

## Where to start

`src/daemon/flows.ts` and its tests (`flows.test.ts`, `flows-budget.test.ts`, `flows-full-proof.test.ts`, `flow-serve.test.ts`), the flow routes (`src/daemon/canvas-routes.ts` around line 137, wired in `app.ts` around 606 and 630), `src/ui/canvas/flow-arrows.tsx`, `src/runtime/walk-protocol.ts`, `ui.go` in `src/runtime/frame-runtime.ts`. The spike's `extensions/flows/` (it matched today's graph on spool's own canvas, 740 frames and 235 edges on 2026-11-10, and needed memo to match today's speed).

## Leave alone

How flows look and behave, in the window and in the player.

## Done when

- No flows code is left in core; the lint holds.
- The graph equals today's on the pinned copy of spool's own canvas, and the budget test passes.
- Renaming, moving, trashing, restoring and copying a frame that flows point at rewrites the targets in the same step, and one ⌘Z reverses it: the existing tests for that pass through the participant.
- The flows suites pass against the new window and, unchanged, against today's; added to the parity list.
- A walk in the player, an HTML export and a share still work.
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.
