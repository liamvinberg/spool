# spool

Spool is a local-first prototyping canvas. Agents author live TSX frames; people arrange them spatially and walk through the flows between them.

- Code, tests, and configuration are the source of truth. Read the implementation and nearest tests before changing behavior. Do not add documentation that restates the code.
- Start at `src/cli.ts` for commands, `src/daemon/` for local server and project state, `src/ui/` for the canvas, and `src/runtime/` for code injected into frames and the player. `research/` is historical evidence, not current behavior.
- Release Please derives versions and changelog entries from commits on `main`. Before committing or choosing a squash title, follow `docs/releases.md`; commit types describe user-visible release impact, not the kind of implementation work.
- Keep a session to one non-research ticket. Use Node 22+ and pnpm. Before handoff, run the relevant tests, `pnpm typecheck`, and `pnpm check`; run `pnpm test` for changes with broader behavioral reach.
- `design/` is Spool's dogfood canvas. Run `spool skill` before working there; its nested `AGENTS.md` governs that folder.
- Treat working-tree changes confined to `design/` as live canvas work. They do not block landing unrelated work whose paths do not overlap them.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `liamvinberg/spool`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the five canonical triage-role labels unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

The repo uses a single-context domain-doc layout, with the glossary in `CONTEXT.md` at the root. See `docs/agents/domain.md`.
