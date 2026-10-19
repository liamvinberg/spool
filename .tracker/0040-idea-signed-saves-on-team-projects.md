# #40 · Idea: signed saves on team projects

- State: open
- Created: 2026-10-18T17:43:55.665Z
- Updated: 2026-10-18T17:43:55.665Z

Taken out of the Spool Cloud for teams map on 2026-10-04 by Decide what a teammate's files may do on your machine (#21): the first team version does not sign saves.

The idea: each save to a team project is signed with the writing member's device key, and every receiving daemon checks the signature before writing the file. A compromised Spool Cloud could then no longer push files that look like a teammate's.

Without it, v1 relies on the receiving daemon's own allowlist of Spool's layout (only regular files under `canvas.json`, `AGENTS.md`, `CLAUDE.md`, `frames/**`, `shared/**`) and on the browser sandbox to limit what any pushed file can do, whoever wrote it. Sits beside end-to-end encryption as an enterprise extra.

Nothing is decided.

*From Linear DEV-154.*

Related: #61, #65, #21, #3

Plane: SPOOL-40
