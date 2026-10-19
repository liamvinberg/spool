# #110 · Agents hear about a file that didn't sync, and the docs list the limits

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.431Z
- Updated: 2026-10-18T17:44:00.580Z
- Closed: 2026-10-18T17:44:00.580Z

## What to build

Decided in Decide what one busy project must hold at launch (#106). Spans spool (`src/daemon/team-sync.ts` `hold`, the agent-facing `spool` verbs, the skill) and the docs.

Today a file over 25 MB, outside the layout, or past the 1 GB project cap stays on that Mac. The person's open canvas gets a notice, but the agent's write succeeds and it never hears, so teammates see a broken frame.

- **The agent hears it.** The next `spool` command an agent runs on that project names each file that didn't travel and why.
- **The skill says the limits up front.** Keep each file under 25 MB. Shrink video and large images on the Mac (ffmpeg or similar) before they go in `design/`, choosing the quality on purpose. Spool never compresses anything itself.
- **The docs gain a Limits section.** 1 GB per project, 25 MB per file, 30,000 saves per editor per project a month, 120 saves a minute per project with 2,000 at once. No limit on people. "Tested with 100 people in one project" goes in only once Presence stays light in a crowded project (#107) has passed its test. The landing says nothing about size.

## Acceptance criteria

- [ ] An agent that writes a 30 MB video into a team project is told by its next `spool` command, with the file and the reason
- [ ] The skill names the 25 MB limit and how to shrink media
- [ ] The docs list the limits above
- [ ] Changeset for the published change

*From Linear DEV-261.*

Related: #117, #119, #107, #106, #103

Plane: SPOOL-110

## Comments

### agent, 2026-10-18T17:44:00.571Z

**Liam, 2026-10-14:** Built in task 153 (9ff487ea, 72a07b22 and the docs/changeset commits), on spool main. Project verbs and check print what didn't travel once each; skill names 25 MB and how to shrink media; README has a Limits section.
