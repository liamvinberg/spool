# spool

Spool is a local-first prototyping canvas. Agents author live TSX frames; people arrange them spatially and walk through the flows between them.

- Code, tests, and configuration are the source of truth. Read the implementation and nearest tests before changing behavior. Do not add documentation that restates the code.
- Start at `src/cli.ts` for commands, `src/daemon/` for local server and project state, `src/ui/` for the canvas, and `src/runtime/` for code injected into frames and the player.
- Changesets derive versions and changelog entries from `.changeset/` files, never from commit messages. When a change alters published behavior, land a changeset with it per `docs/releases.md`; work confined to `design/`, docs, tests, or internals ships none.
- Keep a session to one non-research ticket. Use Node 22+ and pnpm.
- Test in a tight loop: after each change run `pnpm test:changed`, which picks the tests beside, importing or naming what the branch changed (`--deep` follows imports all the way; see `src/test-changed.ts`), and add any suite the change drives that it misses with `pnpm vitest run <path>`. Run the full `pnpm test` once, at the end, before handoff or merge: it takes 10 to 20 minutes on a shared machine. Then `pnpm typecheck` and `pnpm check`. The suite sizes its workers to the machine's free cores; `SPOOL_TEST_WORKERS` sets them.
- The spool CLI in this checkout is `pnpm dev <verb>`: the checkout is its own instance (state `~/.spool-dev`, port 7767 unless that state's `config.json` names another). Never drive the installed `spool` from here — it is a different instance on a different version.
- `desktop/` is the Mac app: an Electron window on the daemon that bundles the published package. Its README covers building and releasing it.
- `design/` is Spool's dogfood canvas. Run `pnpm dev skill` before working there; its nested `AGENTS.md` governs that folder. `design/frames/app/` mirrors what ships, so a change to what `src/ui` or `src/runtime` draws also redraws its frame there.
- `design/` is a team project, `spool.page/devosurf/spool` (`spool.json` at the root): it is out of git, and every save in it reaches the team through spool.page within a second, so canvas work is never committed, merged or shipped. A fresh worktree has no `design/` until a `pnpm dev` verb fetches it, which needs the checkout instance signed in once (`pnpm dev login`). Read the canvas in a browser at that address.
- Commit atomically as you go, one change per commit. Message: `area: what changed` in lowercase plain words, no body (`daemon: create a project from a folder name`). The `design: <counts>` commits in history are the daemon's old canvas saves, not a style to copy.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `liamvinberg/spool`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the five canonical triage-role labels unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

The repo uses a single-context domain-doc layout, with the glossary in `GLOSSARY.md` at the root. See `docs/agents/domain.md`.
