# #54 · Idea: cloud agents drawing on a team canvas

- State: open
- Created: 2026-10-18T17:43:55.808Z
- Updated: 2026-10-18T17:43:55.808Z

Taken out of the Spool Cloud for teams map on 2026-10-04 by Decide how a project becomes a team project and reaches each member's machine (#43): the first paid version accepts that agents running in the cloud can't work on a team project.

The idea (Liam): a Claude Code routine, Claude Code on the web, Codex cloud or a Cursor agent draws straight onto the team's live canvas, so teammates watch a prototype appear. "A game changer."

What the grilling sketched, to start from:

- **Getting in:** a per-account agent token made in Spool's settings, set as `SPOOL_TOKEN` in the vendor's secrets (never pasted into a transcript), listed and revoked like a machine. The agent acts as its person, so it takes no extra seat. Copilot has only repo or org secrets, so one person's token would serve the repo.
- **Fetching:** already decided for v1: any `spool` command that finds `spool.json` with no `design/` fetches it. A session-start hook can run it.
- **Saving back:** a `spool sync` verb that sends changed files with the version each was based on, so the collision rule sets aside an hour-old edit rather than rolling the canvas back. Run before finishing, from an end hook (Claude Code Stop/SessionEnd, Cursor `stop`, Copilot `sessionEnd`), and by every other `spool` command along the way.
- **Live:** a sync daemon in the sandbox would make it truly live. Only Cursor documents long-lived processes; the others are unconfirmed.
- Each team must allow [spool.page](http://spool.page) in the vendor's network settings.

Evidence: `spool-cloud/research/157-cloud-agents-fetching-design.md` (`6cd145a`), a documentation read of all four vendors, not a test on real accounts.

*From Linear DEV-168.*

Related: #65, #43, #3

Plane: SPOOL-54
