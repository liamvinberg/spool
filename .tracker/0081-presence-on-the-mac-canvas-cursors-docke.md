# #81 · Presence on the Mac canvas: cursors, docked pills, faces and follow

- State: closed
- Labels: ready-for-agent
- Parent: #63
- Blocked by: #71
- Created: 2026-10-18T17:43:56.082Z
- Updated: 2026-10-18T17:43:59.521Z
- Closed: 2026-10-18T17:43:59.521Z

## Parent

#63

## What to build

On a team project's canvas, teammates show up over the sync connection as ephemeral messages, never stored or written to `design/`, one per person however many local copies they have. A cursor is the person's coloured pointer (colours unique within the team) with a name pill shown while they move or press, held 1.4 s after they stop, then faded; movement smoothed with no overshoot; idle sinks to a third of the ink; leaving fades out. Inside a live frame the pill docks beside that frame's name for as long as they're inside, several lining up and idle ones dimmed, the pointer bare inside; stepping out flies the pill back. Dragging closes the pointer into a grabbing hand and a moved frame carries the dragger's outline in their colour. Top right: faces of who's here, a count when they don't fit, an open list with each person's page or idle and how long; pressing a face follows their view with an outline in their colour and `following <name> · esc` until esc or a manual camera move.

## Acceptance criteria

- [X] In the harness, two canvases see each other's named pointers with the pill timing and idle and leave states
- [X] Entering a frame docks the pill on its name; leaving flies it back
- [X] Dragging shows the hand and the coloured outline
- [X] Follow tracks the other camera and stops on esc or a manual move
- [X] Two local copies on one machine show one person
- [X] Nothing presence-related is written to disk or history

## Blocked by

- #71

*From Linear DEV-196.*

Plane: SPOOL-81

## Comments

### agent, 2026-10-18T17:43:59.513Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0, with presence live on the cloud.

Decisions where the spec was silent:
- Someone is idle after 60 s with no change.
- Names are the email's local part.
- Each member keeps a colour from when they joined, stored with the team. No two members share one at any team size.
- A pointer inside a live frame isn't tracked, so someone busy inside a frame for a minute can read as idle.
- Faces show up to 4, then 3 and +N.
- The top page is called "frames" in the list.

Nothing left on this ticket.

Check for Liam: on two Macs in Devosurf, each sees the other's pointer, name, face and a different colour. Closing the app fades the person out within seconds.
