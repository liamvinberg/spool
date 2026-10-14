# Issue tracker: Linear

spool's work is tracked in Linear: workspace devosurf, team Devosurf, project Spool. Use the Linear connector.

## Conventions

- Create a spec or ticket as a Linear issue in project Spool, team Devosurf.
- Read an issue with all comments and labels before acting on it.
- Apply and remove labels without replacing unrelated labels.
- Name issues by their Linear id (`DEV-280`).

## Wayfinding operations

Used by `/wayfinder`. The map is a Linear issue; its tickets are its sub-issues.

- **Map**: an issue labelled `wayfinder:map`, holding Destination, Notes, Decisions so far, Not yet specified and Out of scope. Its Destination names decisions to make, never a build to ticket.
- **Ticket**: a sub-issue of the map (`parentId`) labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`. A task ticket only does what a decision waits on.
- **Specs and build tickets** are the handoff after the map: they never become its sub-issues and carry no `wayfinder:` label. Create them with no parent and link the decision they come from.
- **Blocking**: Linear's native relation (`blockedBy` on `save_issue`). A ticket is unblocked when every blocker is Done or Canceled.
- **Frontier**: the map's sub-issues that are open, unassigned and have no open blocker, first in map order.
- **Claim**: assign the ticket to the driving dev, the session's first write.
- **Resolve**: post the answer as a comment, set the ticket Done, then add a gist and link to the map's Decisions so far.
- **Close the map** when no decision is left before the destination: post a comment saying where any open work went, move every open sub-issue out (no parent, `wayfinder:` label removed) and set the map Done.

## GitHub issues

GitHub Issues on `liamvinberg/spool` take reports from outside only. Triage one by moving what is still wanted into Linear and closing it on GitHub, with a comment that names no private detail.

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a Linear issue in project Spool.

## When a skill says "fetch the relevant ticket"

Read the Linear issue's description, comments and labels.
