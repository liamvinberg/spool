# #183 · Sharing: a share ends on its date, and its address says it stopped or ended

- State: closed
- Labels: ready-for-agent
- Parent: #115
- Blocked by: #182
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:03.429Z
- Updated: 2026-10-21T19:14:02.202Z
- Closed: 2026-10-21T19:14:02.202Z

## Parent

Spec: sharing a whole project (#115)

## What to build

A share can end by itself, and a share's address says when it stopped or ended. The Share popover's foot gains **Ends**, a quiet menu beside Share: Never (default), In 30 days, In 7 days, each with the date it means. Any share, pages or whole project, may have one; the Worker sets the end from its own clock. Past its end a share is not live wherever it is asked for (people page, link host, frames, covers, scenarios, comments), so the end is exact. The five-minute scheduled run gains a job that lets go of shares past their end as a stop does: the compile object is told, and their comments sockets close. An ended share is told apart from a stopped one, and both leave the Shared control. Rows of shares with an end say "ends <d Mon>". Once a share has stopped or ended its address answers with an empty state in the design system's look: "<name> stopped sharing <project>" (the stopper, or the team once that account is gone) or "This share ended on <d Mon>", then "Ask <maker's name> if you need it again." On a link host anyone with the link gets it; on a people share's page only an account its people still name, and anyone else today's "This page isn't here". Members are still sent to the canvas; a lapsed team's share still says "This share has stopped". Glossary: Share gains its end.

Spans spool-cloud (migration, model, access, scheduled job, people page, link host, glossary) and spool (Ends menu, share view types, rows, and the empty state if the viewer draws it).

## Acceptance criteria

- [ ] An editor picks In 7 days; the share's view carries its end and the rows say "ends <d Mon>"; Never adds nothing
- [ ] A worker test: with the injected clock past the end, the link host, people page, frames, covers and comments all refuse at once, before any scheduled run
- [ ] A worker test: the scheduled run lets go of ended shares (the compile object no longer knows them; a comments socket on one is closed) and a second run does nothing more
- [ ] A stopped link share's host answers "<name> stopped sharing <project>" and "Ask <name> if you need it again."; an ended one "This share ended on <d Mon>"
- [ ] A stopped people share's page shows the empty state to a named account, "This page isn't here" to any other, and still redirects a member to the canvas
- [ ] A lapsed team's share still answers "This share has stopped"
- [ ] No address on any of these pages shows an email address
- [ ] spool-cloud GLOSSARY.md's Share entry says a share may end by itself
- [ ] A changeset for spool's published behaviour

## Blocked by

- #182

## Comments

### agent, 2026-10-21T19:14:02.202Z

Built and merged: spool 863def92, spool-cloud de0703a. Cloud: migration 0037_share_ends (ends_at); request ends never/30d/7d set from the Worker's clock; a share past its end is not live wherever asked (liveAt in model.ts); the 5-minute scheduled run lets go of ended shares (compile object told, comment sockets closed; second run does nothing); ended = stopped_at=ends_at with no stopper; stopped/ended empty state on link host and people page ("<name> stopped sharing <project>" / "This share ended on <d Mon>", "Ask <maker> if you need it again.", names only, no email); a stopped/ended share's email link sends whom it names to its page; members still redirected, lapsed still "This share has stopped"; glossary. Spool: Ends menu in the popover foot with each option's date, "ends <d Mon>" in rows and detail, changeset. Spec recommendations taken: name only in the ended state, no end-date edits after sharing. Human step: design/frames/app/ spool-canvas--share and --shared need the Ends control and "ends" rows mirrored.
