# #82 · Presence in the browser, on Home's covers and on phones

- State: closed
- Labels: ready-for-agent
- Parent: #63
- Blocked by: #77, #79, #81
- Created: 2026-10-18T17:43:56.097Z
- Updated: 2026-10-18T17:43:59.555Z
- Closed: 2026-10-18T17:43:59.555Z

## Parent

#63

## What to build

Members on the browser canvas (viewers, or editors away from their Mac) see and are seen exactly as on the Mac canvas. Outsiders never connect to presence: they see nobody and appear nowhere. Home's covers for team projects show who's inside right now ("2 here", "sam is here"), in the app and on the team's page. The phone navigator's page tree shows who's in each part.

## Acceptance criteria

- [X] A viewer in a browser appears on an editor's Mac canvas and vice versa
- [X] An outsider's browser shows no one and appears in no one's faces
- [X] Covers show who's inside, updating live
- [X] The phone navigator shows who's in each part

## Blocked by

- #81
- #77
- #79

*From Linear DEV-197.*

Plane: SPOOL-82

## Comments

### agent, 2026-10-18T17:43:59.546Z

**Liam, 2026-10-06:** Shipped in spool.page 0.31.0, live on beta.spool.page and spool.page.

Decisions where the spec was silent:
- In a browser, "inside" means the frame being played.
- The same account on a Mac and in a browser is one person.
- Covers say who is inside, never you.
- Home and the team page ask every 10 s while shown. One small object per team keeps who is in each project, in memory only, so asking no longer wakes every project.
- Up to 4 faces (3 on a phone), then "N here".
- Outsiders never connect, so they see nobody and nobody sees them.

Nothing left on this ticket.

Checks for Liam:
- [ ] A viewer in a browser and an editor on a Mac see each other's pointers and faces.
- [ ] Closing the tab fades the person out within seconds.
- [ ] Home's "2 here" updates within about 10 s.
