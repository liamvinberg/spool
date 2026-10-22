# #185 · Sharing: a solo project shares its whole project

- State: closed
- Labels: ready-for-agent
- Parent: #115
- Blocked by: #182
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:03.472Z
- Updated: 2026-10-21T19:14:02.217Z
- Closed: 2026-10-21T19:14:02.217Z

## Parent

Spec: sharing a whole project (#115)

## What to build

A solo project shares its whole project too (open question 4 of #115: drop this ticket if Liam decides otherwise). The Share popover on a solo project offers Whole project like a team project's. Its daemon then uploads what every page is made of, by the rule it uploads shared pages by today, within the 1 GB fair-use limit, and a page added later goes up with the next upload after a turn or a quiet spell, settling into the share. Stopping the last whole share lets go of what only it showed, as today. Spans spool (daemon `shares.ts` upload set, Share popover) and spool-cloud (accepting `whole` for a solo project).

## Acceptance criteria

- [ ] A daemon test with a fake cloud: a whole-project solo share uploads every page's files and covers, and nothing outside `design/`'s travelling layout
- [ ] A page added after sharing goes up after the next turn or quiet spell and appears for the outsider
- [ ] A project over the fair-use size is refused with today's too-large reason, said in the popover
- [ ] Stopping it uploads only what remaining shares show
- [ ] A changeset for spool's published behaviour

## Blocked by

- #182

## Comments

### agent, 2026-10-21T19:14:02.217Z

Built and merged: spool 863def92, spool-cloud de0703a (cloud already accepted whole for solo; added a worker test that a solo whole share takes in a page its next upload brings). Spool: Whole project offered on solo projects too; the daemon uploads every page's files and covers (travelling layout only) for a whole solo share, a page added later goes up after the next turn or quiet spell, keeps following while the project has no page, too-large is said in the popover ("over spool.page's 1 GB limit"), stopping uploads only what remaining shares show; changeset. Spec recommendation taken: #185 is in.
