# #170 · Comments: the inbox and the rules

- State: closed (shipped in 0.44.0 and deployed)
- Labels: ready-for-agent
- Parent: #167
- Blocked by: #169
- Created: 2026-10-20T06:52:21.742Z
- Updated: 2026-10-20T17:57:30.075Z
- Closed: 2026-10-20T17:57:30.075Z

## Parent

Spec: comments on Spool Cloud (spool#167)

## What to build

The Comments tab beside Properties and Agent becomes the inbox (spool#162): filters all, unread and for you, a Resolved switch and sorting in its menu, rows grouped by frame showing audience, reply count and "edited since", a click flies to the pin and opens it, a + turns on the Comment tool, and an unread dot on the tab when it's out of sight. Unread is per account per comment and never your own; opening the card marks it read, Mark unread undoes it, and reads reach your other Macs and browsers live. Pins get an accent ring when unread and a thicker one when open, merge into a count with faces under 32 screen px and fan out on click, show a count on page objects, and Shift+C hides them all. Resolved pins are hidden unless the switch is on, then hollow with a check. The rules: anyone who can reply resolves and reopens; authors edit their own (marked edited); authors delete their own and admins and editors delete anyone's, the first message taking its replies with it; the ⋯ menu offers Edit, Copy link and Delete on yours and Copy link, Mark unread (and Delete for admins and editors) on others'. @mentions of members in the composer, in the accent colour. "For you" means mentions of you and comments you wrote or replied in. Limits: 1 to 4,000 characters, 30 comments and replies a minute per account per project as a refilling bucket, at most 5,000 open comments per project, each a constant a maintainer can raise, each refusal shown in plain words.

## Acceptance criteria

- [ ] The Comments tab lists every comment the person can see, with the filters, the Resolved switch and sorting, and flies to a pin on click
- [ ] Unread rings, the tab's dot and Mark unread behave per person and stay in step across that person's Macs and browsers
- [ ] Resolve, reopen, edit and delete follow the permission rows in the spec, and Cloud refuses anything outside them
- [ ] Pins merge under 32 screen px and fan out on click; Shift+C hides them
- [ ] @mentions list members and a mentioned member finds the comment under "for you"
- [ ] Past each limit, Cloud refuses with a reason the composer shows
- [ ] Worker tests cover every permission row and limit; browser tests cover the tab, filters, merging and Shift+C

## Blocked by

- Comments: a Team comment on the Mac, live (spool#169)

## Comments

### agent, 2026-10-20T09:46:23.759Z

Landed on the spec branches. Handoff: /tmp/pi-orch/spec-191/handoffs/t170.md. Choices to confirm: Comments pane hotkey ⌘⇧U; Delete without confirm; Mark unread only on others' messages.

### agent, 2026-10-20T17:57:30.075Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.
