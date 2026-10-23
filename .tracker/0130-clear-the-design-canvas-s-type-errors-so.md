# #130 · Clear the design canvas's type errors so spool check is a gate

- State: closed (completed)
- Labels: ready-for-agent
- Tasks: task 218 (Fix design canvas type errors)
- Created: 2026-10-18T17:43:56.657Z
- Updated: 2026-10-22T18:48:36.761Z
- Closed: 2026-10-22T18:48:36.761Z

Moved from liamvinberg/spool#356 (closed there; GitHub issues are no longer where this work is tracked).

Found in a retro over agent-hub tasks 35–48 (agent-hub `docs/retros/2026-10-07-tasks-1-48.md`, problems 10–12 and 17). Each one cost agents time or work; they are spool's to fix.

### 1. `spool check` can't check spool's own canvas

- `checkSourceLimits.maxFiles` is 512 (`src/check-budget.ts`). spool's canvas has 1383 `.tsx` files, so `spool check .` stops with `TS5083 Offline check resource limit exceeded`.
- `spool check <frame dir>` walks up to the project and fails the same way, so not even one frame can be checked.
- Task 45's 55 new frames pushed it over the limit. Its workers piped `tsc … | grep`, which hid the error, and believed they had checked.
- **Ask:** check only the frames under the given path and what they import. Or raise the budget, or make it scale with the canvas.

### 2. `spool check` writes files

- On spool's canvas today, `spool check .` printed "frames … are named by their path now; walk targets rewritten in 19 files" and rewrote them, with `canvas.json` going to `format: 2`.
- Opening an old worktree did the same: task 35's worktree had 20 such dirty files. They read as an agent's unsaved work, so the worktree couldn't safely be removed without diffing it first.
- **Ask:** make `check` read-only (report "needs migration"). Or say which files a migration changed, so it isn't mistaken for work.

### 3. `app` frames drifted from the shipped app

- Task 45 briefed 12 design workers that the `app` frames showed "how spool looks today". They didn't: the shipped rail, agent panel and tools differ.
- All of round 1 was drawn from them and thrown away.
- design/AGENTS.md already says "read the implementation before trusting a frame", but nothing flags the drift.
- **Ask:** a way to see a frame is stale (the commit it was drawn from, or a check against `src/ui/`). Or refresh `app` from shots of the running app.

### 4. Parallel agents share one daemon

- In task 40 an agent ran `spool remove` on task 45's registered worktrees, taking them for throwaways. One `~/.spool` and one port serve every task.
- `SPOOL_DIR` and `SPOOL_PORT` already give a checkout its own lane (`desktop/src/daemon.ts`), but no doc an agent reads mentions them.
- **Ask:** one line in AGENTS.md: in a worktree, run with `SPOOL_DIR=<worktree>/.spool` and a free `SPOOL_PORT`. Or have the CLI do that when it runs in a git worktree.

### 5. The release's dmg job gives up on npm too soon

- With `SPOOL_RELEASE_BUILD=1`, `desktop/scripts/bundle-cli.sh` waits 60 × 10 s for npm to serve the new `spool.page` version.
- In task 48 that ran out and the dmg job failed.
- **Ask:** raise `REGISTRY_ATTEMPTS`, to around 30 min.

### 6. The full suite needs `bwrap` and `socat`

- On a machine without them (devobee), 16–20 tests fail even on main.
- In task 40 an agent spent \~24 min proving the failures weren't its own. In task 48 the failures were judged by eye.
- **Ask:** skip those tests with a clear "needs bwrap/socat" message, the way a missing browser is handled.

### 5. The design canvas's own type errors (was liamvinberg/spool#271)

Folded in from liamvinberg/spool#271. `pnpm check` over `design/` could not be used as a gate because of pre-existing type errors in `shared/`. Today it stops before that, at the check budget in 1 above (TS5083 named on other questions' files by every designer in agent-hub task 126), so fixing 1 will surface whether this debt is still there.

Original liamvinberg/spool#271:

`pnpm check` over `design/` exits 1 on \~75 pre-existing errors today, so a new frame cannot use it as a gate; every session has to grep its own paths out of the output to know its work is clean.

The errors cluster in shared files and one frame:

- `design/shared/ui/spool-play-field.tsx:85:30` TS2786: `'Take' cannot be used as a JSX component. Its type '(() => ReactNode) | undefined' is not a valid JSX element type.`
- `design/shared/ui/site-canvas-still.tsx:551:32` TS7006 (implicit any) — nine of these; `useTransform` callbacks need explicit `(v: number)` under this tsconfig
- `design/shared/ui/coffee-screens.tsx`, `spool-agent-rail.tsx` — runs of TS2375 under `exactOptionalPropertyTypes`
- `design/shared/ui/spool-find-palette.tsx`, `design/shared/lib/claude-turn.ts` — TS7006
- `design/frames/site/site-hub--composed/frame.tsx` — 27 TS7006, same `useTransform` pattern

Two fixes, both worth having: clear the debt so the gate means something again, and give the check a per-path filter so one frame's author can ask about one frame.

*From Linear DEV-281.*

Plane: SPOOL-130

## Comments

### agent, 2026-10-18T17:44:01.203Z

**Liam, 2026-10-11:** Landed on spool main in c15df471 (agent-hub task 127, a retro on how agents use spool):

- 1: `spool check <frame|folder>…` checks only that import closure and counts the budget on it; over the limit it says "not checked: N source files, the limit is 512"; a count line on every run.
- 2: `check` no longer writes files; a due frame-name migration is left to `spool open`, with a note.
- 4: AGENTS.md has the lane line (SPOOL\_DIR/SPOOL\_PORT); verbs and `status` warn when the daemon's source tree is gone.
- release dmg: REGISTRY\_ATTEMPTS raised to ~30 min.
- bwrap/socat: nothing in the suite needs them now; the full suite passed on devobee (4188 tests).

Still open: 3 (stale `app` frames) and the canvas's own type errors, which `spool check design/frames/<page>` can now show page by page.

### agent, 2026-10-18T17:44:01.211Z

**Liam, 2026-10-13:** Item 1 (check budget) is fixed by spool f8a331a6 (check only the frames named, count their closure). The rest still needs triage. Noted in agent-hub task 146.

### agent, 2026-10-18T17:44:01.220Z

**Liam, 2026-10-14:** Status on main (2026-10-14):

1. Check budget: done. `spool check <path>` checks only the frames named and their imports (f8a331a6). `spool check design` on spool's whole canvas still stops at 822 of 512 files, by design: it says to name a page.
2. Check writes files: done. A due migration is left to `open` and said (bb272f40).
3. Stale app frames: covered by the AGENTS.md rule that a change to what src/ui or src/runtime draws also redraws its frame in design/frames/app.
4. Daemon lanes: done, AGENTS.md documents SPOOL\_DIR/SPOOL\_PORT lanes.
5. dmg waits on npm: done, REGISTRY\_ATTEMPTS=180 (30 min).
6. bwrap/socat: moot. No test references them any more, and devobee has both.

Left: the design canvas's own type errors (liamvinberg/spool#271). `spool check design/frames/app` today: 68 frames, 13 errors, all in design/shared (claude-turn.ts, primitives/feedback.tsx, spool/play-field.tsx). Retitled to that.

### agent, 2026-10-22T18:48:34.265Z

**Agent, task 218:** The design canvas's type errors are cleared, so `spool check` can be used as a gate. Every page checks clean: app 79 frames, explore 69, site 25, system 12, all with 0 errors and exit 0. `spool check design` on the whole canvas also fits the budget now (185 frames, 439 source files, 0 errors).

- **feedback.tsx (src fix, spool c15854d2):** the error `Property 'transform' does not exist on type 'CSSProperties'` wasn't in the canvas. Under pnpm, check couldn't find `csstype` through the link pnpm places beside `@types/react`, so every `CSSProperties` came out empty. Check now trusts that link and the folders above it. There's a regression test in `check-resolution.test.ts` and a patch changeset. This fix reaches the installed `spool` with the next release.
- **claude-turn.ts:** `as number | null` on the index reads of `anchor`/`at`, and `(live as Live)` after the forEach.
- **play-field.tsx:** `Take !== undefined && <Take />` (the early return already guarantees it).
- **Other pages' shared files:** fair/radar.tsx, fair/shader.tsx and gust/window.tsx get `!` on index reads. sola/ring.tsx gets a tuple cast on the `finishes` spread. sola/slides.tsx (Nav), ring.tsx (from, name), sova/prices.tsx (lamp) and site/chapters/waitlist.tsx (state, email) now spell out `| undefined` on optional props. stilla/speaker.tsx types the `traverse` callback.
- **Frames site/demo/stilla-colour, stilla-top and stilla-order:** the `ui.state` reads are cast to `ColourId`, `keyof typeof finishes` and `PoseName`, using type-only imports.

All the canvas edits are type-only, so the frames render as before. They reached spool.page (checked with `spool history`). The full suite passed except `cover-browser.test.ts`, which failed once under load and passes when run on its own.

Side note: the shared 7767 daemon is still running from task 206's deleted worktree. It warns that it can stop syncing team projects and should be restarted from a checkout that exists.
