# #222 · The AGENTS.md line names design/ at the checkout root when the project sits in a subfolder

- State: open
- Labels: bug, needs-triage
- Created: 2026-11-05T17:52:29.123Z
- Updated: 2026-11-05T17:52:29.123Z

`spool init --team devosurf` in `sandbox/lab` (task 433) wrote "design/ is a spool canvas: run `spool skill` before working there." into the sandbox checkout's root `AGENTS.md`. The canvas is at `lab/design/`, so an agent at the root looks for a `design/` that isn't there.

`addAgentsLine` in `src/agents-line.ts` always writes the fixed `AGENTS_LINE`. It should name the design folder's path from the checkout root (`lab/design/ is a spool canvas: ...`), or write the line beside `spool.json`. The duplicate check has to match the path-aware line too.
