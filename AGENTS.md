# spool

Spool is a local-first prototyping canvas. Agents author live TSX frames; people arrange them spatially and walk through the flows between them.

- Code, tests, and configuration are the source of truth. Read the implementation and nearest tests before changing behavior. Do not add documentation that restates the code.
- Start at `src/cli.ts` for commands, `src/daemon/` for local server and project state, `src/ui/` for the canvas, and `src/runtime/` for code injected into frames and the player.
- Changesets derive versions and changelog entries from `.changeset/` files, never from commit messages. When a change alters published behavior, land a changeset with it per `docs/releases.md`; work confined to `design/`, docs, tests, or internals ships none.
- Keep a session to one non-research ticket. Use Node 22+ and pnpm.
- Test in a tight loop: after each change run `pnpm test:changed`, which picks the tests beside, importing or naming what the branch changed (`--deep` follows imports all the way; see `src/test-changed.ts`), and add any suite the change drives that it misses with `pnpm vitest run <path>`. Run the full `pnpm test` once, at the end, before handoff or merge: it takes about ten minutes, longer on a busy machine. Then `pnpm typecheck` and `pnpm check`. The suite sizes its workers to the machine's free cores; `SPOOL_TEST_WORKERS` sets them.
- The spool CLI in this checkout is `pnpm -s dev <verb>` (`-s` drops pnpm's own lines around every verb): the checkout is its own instance (state `~/.spool-dev`, port 7767 unless that state's `config.json` names another). Never drive the installed `spool` from here — it is a different instance on a different version.
- The 7767 daemon is shared with other agents: never stop it. A worktree that needs its own daemon (its own source served, or one to stop) takes a lane: `SPOOL_DIR=/tmp/<lane>/state SPOOL_PORT=<free port> pnpm -s dev …`, and `pnpm -s dev stop` with the same variables before the worktree goes.
- `desktop/` is the Mac app: an Electron window on the daemon that bundles the published package. Its README covers building and releasing it.
- The chrome is built from `src/ui/primitives/` (one file per family: actions, inputs, selection, display, feedback, structure, navigation, overlays) and takes its look only from the roles in `src/ui/theme.css` (`bg-surface-panel`, `text-secondary`, `duration-fast`…): reach for a primitive before writing classes. `pnpm check` runs `src/design-lint.ts`, which refuses the old colour names, raw colours and picked timings; its allowances only shrink. Once a change to the theme or a primitive is on main, `pnpm design:sync` copies it to the canvas.
- `design/` is Spool's dogfood canvas. Run `pnpm -s dev skill` before working there; its nested `AGENTS.md` governs that folder. `design/frames/app/` mirrors what ships, so a change to what `src/ui` or `src/runtime` draws also redraws its frame there.
- `design/` is a team project, `spool.page/devosurf/spool` (`spool.json` at the root): it is out of git, and every save in it reaches the team through spool.page within a second, so canvas work is never committed, merged or shipped. A fresh worktree has no `design/` until `pnpm -s dev open .` fetches it (check, build and the read verbs do too; skill doesn't), which needs the checkout instance signed in once (`pnpm -s dev login`). Read the canvas in a browser at that address.
- Commit atomically as you go, one change per commit. Message: `area: what changed` in lowercase plain words, no body (`daemon: create a project from a folder name`). The `design: <counts>` commits in history are the daemon's old canvas saves, not a style to copy.

## Agent skills

### Issue tracker

Issues and specs live in Linear (team Devosurf, project Spool), not GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the five canonical triage-role labels unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

The repo uses a single-context domain-doc layout, with the glossary in `GLOSSARY.md` at the root. See `docs/agents/domain.md`.
