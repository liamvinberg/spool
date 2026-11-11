# #266 · Deck: a deck on disk, laid out and kept in step by the daemon

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Created: 2026-11-10T17:59:11.652Z
- Updated: 2026-11-10T19:09:30.537Z
- Closed: 2026-11-10T19:09:30.537Z

## Parent

#265 (the spec; read it first, then ticket #255's resolution for what was decided and turned down)

## What to build

A deck exists on disk and spool keeps it laid out. With the experiment `deck` on, a page whose folder holds a `deck.json` is a deck: the daemon reads it, lays the page out with one pure function, writes the places into the geometry sidecars, applies deck changes whole, and tells the window when the deck changes. No UI yet: this slice is proven by writing a `deck.json` by hand or as an agent would, and seeing the frames line up on today's canvas.

Read the spec's "A deck on disk" first; it holds every rule. In short:

- The experiment `deck` in the experiments registry, experimental, off by default. Off is absent: no route answers, nothing is written.
- The shared deck model, pure and with no I/O, used by the daemon now and the window later: read and write `deck.json` (version 1, the talk's size, `slides` one name per line, forgiving reads, unknown keys kept), the layout function, the change rules (insert, trade, take out, reorder, several at once, set the talk's size, the pushed run in the loose grid), and the reconcile plan. The prototype's `shared/ui/spool/deck/talk.ts` on the team canvas holds the same rules and numbers as a reference.
- The deck read for a page: size, slides in order, loose frames, problems. (Beats, live and notes join it in the next ticket; leave room in the shape.)
- One deck-change operation that applies an intent whole (`deck.json`, the sidecars, the `notes.md` swap of a trade) and answers with what an undo needs. Include "make a deck" (an empty deck on a page, and with a given list of frames).
- Reconcile on outside changes: debounced, idempotent, only sidecars whose place differs, only for a layout version it knows.
- Rename, move to another page, trash, restore and duplicate keep `deck.json` in step.
- A change to `deck.json` reaches the window as a deck change for that page, not as a change to a frame called `…/deck.json`.
- The glossary entries the spec lists.

## Why it is cut this way

Places are written, not computed, so every reader of a frame's place stays right without knowing what a deck is (the spec says why). Everything that writes into `design/` for a deck is in this one ticket, so the risky part is reviewed once and the UI tickets only send intents.

## Where to start

Pointers as of today's main, to be checked: the experiments registry (`src/settings/experiments.ts`); how the projection reads sidecars and completes a missing place (`src/daemon/projection.ts`, `sidecar.ts`, `geometry.ts`, `placement.ts`); the geometry route and its batch write (`src/daemon/canvas-routes.ts`); structural operations and the one place a rename is followed (`src/daemon/explorer.ts`, `renamed()`, `frame-links.ts`); the watcher and how a changed path is classified (`src/daemon/watch-tree.ts`, `events.ts`); the window's undo recorder for geometry (`commitGeometry` in `src/ui/canvas/canvas.tsx`) for what an undo answer must carry.

## Leave alone

The canvas, the rail and the player. Team sync's code: the deck's files sync as ordinary files. `canvas.json`: the deck does not use it.

## Second review

Beside the standard review, an Opus reviewer (`model: anthropic/claude-opus-5-5:high`) reads this ticket for one risk: it makes the daemon write into `design/` without a hand asking (reconcile) and swap files (a trade's notes), on projects that sync to a team, where two bugs about lost files are open (#243, #249). The reviewer checks that reconcile cannot loop between two machines or two versions, cannot run on a half-written file, never writes when nothing differs, and that no path through a change or its undo can lose a `notes.md` or leave `deck.json` naming a frame twice.

## Done when

- The model's rules are proven as functions, including reconcile being idempotent and order-independent.
- Over a fixture `design/`: writing a `deck.json` from outside lays the page out; a second run writes nothing; an unknown version writes nothing; each change applies whole and its undo restores the exact bytes; rename, move, trash, restore and duplicate keep the deck in step.
- With the experiment off, none of it answers or writes.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Comments

### agent, 2026-11-10T19:09:30.537Z

Landed on main (up to f0f787e5), behind the experiment `deck`. Standard review plus the Opus risk review; every must and should fix done and re-checked. Open, for task 557: extra layout writes while team sync is still delivering a change (noise, nothing lost; bounded by the loop breaker); the spec's "a name with no frame is skipped" kept, a reviewer suggested a hole instead.
