---
name: design-audit
description: Sweep design/ back to the current app plus the open questions, redrawing app frames that drifted and retiring decided explorations.
disable-model-invocation: true
---

# Design audit

`design/` should hold spool as it ships (`app`, `system`, `site`) and the questions still being argued (`explore`). Everything else is in git. This audit finds **drift** (an `app` frame that no longer matches the code) and **sediment** (takes that lost, questions already built, shared files nothing reaches) and removes it.

Run `pnpm dev skill` and read `design/AGENTS.md` first: its rules on the folder shape, naming and `shared/` are the ones this audit enforces.

Run `git status --short design/` before touching anything. A path with uncommitted changes belongs to a session still drawing. Leave the whole question or frame it sits in alone, and list it as skipped.

## 1. App parity

`app` mirrors `src/ui/` and `src/runtime/`, and its frames draw through `design/shared/ui/spool/`, one file per `src/ui` counterpart. For every frame under `design/frames/app/`:

1. Find the code that draws the same surface, then read it: structure, copy, sizes, tokens, motion numbers. The player bar, for example, is `src/runtime/player-chrome.tsx` styled by `src/daemon/play.ts`.
2. Compare that code with the frame and its `shared/ui/spool/` file. Drift is any difference a person would see: a control that moved, was renamed or was removed, a size, a colour, a behaviour.
3. Redraw what drifted from the code. Do this in the shared file, so every exploration that reached it inherits the fix. Delete a frame whose surface no longer ships.

Done when every `app` frame is recorded as matching, redrawn or deleted, and each redrawn one has been checked against its code with `pnpm dev shot`.

## 2. Explorations

For every question under `design/frames/explore/`, find out where it stands. Read its row in `design/AGENTS.md`'s questions table and the ticket the row names (GitHub for public tickets, Linear for private ones, per `AGENTS.local.md`). Run `git log -3 --format='%ad %s' --date=short -- <folder>` on its folder. Then act on the first case that fits:

- **Built**: the decision shipped. Check that the winner now lives in `app` and draw it there if it doesn't (step 1 decides how). Delete the question's folder and its `shared/ui/explore/<question>/` and `shared/lib/explore/<question>/`.
- **Decided, not built**: delete every take that lost, and every state of those takes. Keep the winner and the states it needs, and keep what they import from `shared/`.
- **Open and moving**: its ticket is in progress, or the folder changed in the last two weeks. Leave it.
- **Open and stale**: no decision and no recent movement. Keep it, and list it for Liam with a one-line summary. He decides whether it is argued further or retired.

A decision that lives only in a ticket comment still counts. When the record is ambiguous about which take won, keep the question and list it, quoting what you found.

Done when every question folder is recorded as retired, trimmed, left open or flagged stale, with the evidence behind its case.

## 3. Shared files

After the sweep, build the import graph. Start from every remaining `frame.tsx` and follow its `shared/…` and relative imports through shared files, CSS and assets included. List every file under `design/shared/` the graph never reaches. Delete what only a retired question reached. Keep `tokens.css`, `typography.css` and anything the daemon or tests read (`grep -r "design/shared" src`).

Done when every orphan has been deleted or has a named reader.

## 4. Record and land

- Rewrite the questions table in `design/AGENTS.md` to match the folders that remain. Each row is a pointer and where the question stands. A retired question loses its row.
- Commit one question per commit, `design: retire <question> explorations` or `design: trim <question> to <winner>`, and the app redraws as `design: redraw <surface> as it ships`. Git keeps every deleted take: `git log --diff-filter=D --stat -- design/frames` finds them.
- Check every frame that remains with `pnpm dev check`. If it stops at its resource limit, check a copy of `design/` holding `shared/` plus the touched folders, with an empty `canvas.json`.

Report three lists: what was redrawn, retired or trimmed (one line each, with the commit); what was skipped as in progress; and the stale questions waiting on Liam.
