# spool

Spool is a local-first prototyping canvas. Agents author live TSX frames; people arrange them spatially and walk through the flows between them.

- Code, tests, and configuration are the source of truth. Read the implementation and nearest tests before changing behavior. Do not add documentation that restates the code.
- Start at `src/cli.ts` for commands, `src/daemon/` for local server and project state, `src/ui/` for the canvas, and `src/runtime/` for code injected into frames and the player.
- Changesets derive versions and changelog entries from `.changeset/` files, never from commit messages. When a change alters published behavior, land a changeset with it per `docs/releases.md`; work confined to `design/`, docs, tests, or internals ships none.
- Keep a session to one non-research ticket. Use Node 22+ and pnpm. Before handoff, run the relevant tests, `pnpm typecheck`, and `pnpm check`; run `pnpm test` for changes with broader behavioral reach.
- The spool CLI in this checkout is `pnpm dev <verb>`: the checkout is its own instance (state `~/.spool-dev`, port 7767). Never drive the installed `spool` from here — it is a different instance on a different version.
- `desktop/` is the Mac app: an Electron window on the daemon that bundles the published package. Its README covers building and releasing it.
- `design/` is Spool's dogfood canvas. Run `pnpm dev skill` before working there; its nested `AGENTS.md` governs that folder.
- `design/` is history's: where a project keeps history the daemon commits canvas work itself, so working-tree changes confined to `design/` are a save waiting on its window and never block landing unrelated work whose paths do not overlap them.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `liamvinberg/spool`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the five canonical triage-role labels unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

The repo uses a single-context domain-doc layout, with the glossary in `CONTEXT.md` at the root. See `docs/agents/domain.md`.
