# #63 · Spec: live cursors and who's looking on a team canvas

- State: closed
- Labels: ready-for-agent
- Parent: #3
- Blocked by: #62, #65
- Created: 2026-10-18T17:43:55.893Z
- Updated: 2026-10-18T17:43:58.798Z
- Closed: 2026-10-18T17:43:58.798Z

## Problem Statement

On a team canvas, everyone's edits arrive live, but the people making them are invisible. Two editors can drift onto the same frame without knowing, a viewer in a browser can't tell whether anyone is working, and there's no way to say "look at what I'm looking at". Without a social signal, "no locks" means finding out about each other only through collisions.

## Solution

People show up to each other on a team canvas, in the Mac app and in the browser's read-only canvas, as live cursors and a row of faces at the top right (Prototype live cursors and who's looking (#14)):

- **A cursor** is the person's coloured pointer with their name in a pill. The pill shows while they move or press, holds 1.4 s after they stop, then fades.
- **Idle** sinks the pointer to a third of its ink. **Leaving** fades the person out.
- **Inside a live frame**, the pill docks beside that frame's name for as long as they're inside. Several line up; an idle one dims. Their pointer stays bare inside the frame. Stepping out flies the pill back to the pointer. This is the social signal that replaces locks.
- **Dragging** closes the pointer into a grabbing hand, and a frame being moved carries the dragger's selection outline in their colour.
- **Top right**: the faces of who's here. Pressing a face follows that person's view, with an outline in their colour and `following <name> · esc`. The open list shows each person's page, or idle with how long.
- **Home's covers** show who's inside each team project right now ("2 here", "sam is here").

People only. Outsiders are never shown and see nobody. Agents don't appear.

## User Stories

1. As an editor, I want to see teammates' pointers on the page I'm on, so that I know where they're working.
2. As an editor, I want each pointer in the person's colour with their name in a pill, so that I know who's who.
3. As an editor, I want the name pill to show while they move or press and fade 1.4 s after they stop, so that names don't clutter a still canvas.
4. As an editor, I want pointer movement smoothed with no overshoot, so that cursors feel calm.
5. As an editor, I want an idle teammate's pointer at a third of its ink, so that I can tell who's active.
6. As an editor, I want someone who leaves to fade out, so that the canvas shows only who's here.
7. As an editor, I want a teammate's pill docked beside a frame's name while they're inside that frame live, so that I know someone's working there before I start.
8. As an editor, I want several people inside one frame lined up beside its name, with idle ones dimmed, so that a busy frame reads at a glance.
9. As an editor, I want the docked names to stay the same size at any zoom, so that I can see them zoomed out.
10. As an editor, I want a teammate's pointer bare inside a frame, so that it doesn't cover the design.
11. As an editor, I want a pill that flies back to the pointer when they step out, so that I see them leave the frame.
12. As an editor, I want a dragging teammate's pointer to become a grabbing hand, so that I know they're moving something.
13. As an editor, I want a frame a teammate is moving to carry their selection outline in their colour, so that I know who's moving it.
14. As an editor, I want the faces of who's here at the top right, so that I see the team at a glance.
15. As an editor, I want to press a face to follow that person's view, so that I can look at what they're looking at.
16. As an editor following someone, I want an outline in their colour and `following <name> · esc`, so that I know I'm following and how to stop.
17. As an editor following someone, I want my camera to stop following when I press esc or move it myself, so that I stay in control.
18. As an editor, I want the open list of faces to show each person's page, or idle with how long, so that I know where everyone is.
19. As an editor in a crowded team, I want the faces to collapse into a count when they don't fit, so that the row stays one line.
20. As a viewer in the browser canvas, I want to see and be seen the same way, so that I'm part of the team's canvas.
21. As a member, I want my camera never moved by anyone else unless I chose to follow, so that presence never takes over my view.
22. As an outsider, I want to see nobody and appear nowhere, so that a client view stays calm and private.
23. As a member, I want outsiders never shown in the faces or on the canvas, so that the team's presence is the team's.
24. As a member on Home, I want each team project's cover to show who's inside right now, so that I can join where people are.
25. As a member, I want presence from all my local copies of a team project to count as one person, so that I'm not shown twice.
26. As a member on a phone, I want the navigator's page tree to show who's in each part, so that I can find where people are.
27. As a member, I want presence never written to `design/`, so that cursors don't churn history or sync.
28. As Spool, I want presence to be a cheap broadcast that costs nothing when nobody's connected, so that it doesn't break the cost model.

## Implementation Decisions

- **Channel.** Presence rides the team project's sync connection as ephemeral messages: never stored, never in history, never written to disk. The sync object relays them to connected members only. Browser viewers connect to the same object through the cloud's read-only canvas. Outsiders never connect to presence.
- **Message.** Per person (account, not device): colour, name, page, pointer in world coordinates, pressed or dragging, the frame they're inside, dragged frames, and the camera rectangle (for follow). Throttled on the sender; smoothed on the receiver with no overshoot.
- **States** derived on the receiver: moving (pill shown), still (pill holds 1.4 s then fades), idle (a third of the ink; threshold set by the implementer and noted), gone (fade out on disconnect or leaving the page).
- **Where it draws.** Core's canvas draws the cursors, docked pills, drag hands and outlines, and the faces at the top right, in the Mac app and in the read-only canvas build the cloud serves. Docked pills sit on frame names, which already don't scale with zoom.
- **Follow** sets the follower's camera from the followed person's camera rectangle until esc or a manual camera move.
- **Home covers** read who's in each team project from the cloud.
- **Colours** are assigned per team so two members never share one.
- **People only.** Agent presence is Idea: how people's agents show up on a team canvas (#38).

## Testing Decisions

- Test what one person sees of another, never message shapes.
- **Team harness:** two browsers on one team canvas; moving in one shows a named pointer in the other; stopping fades the pill; entering a frame docks the pill on its name; dragging shows the hand and coloured outline; pressing a face follows and esc stops; disconnecting fades out; an outsider's browser shows no one and appears in no one's faces; two local copies on one machine show one person.
- **Core browser tests** for the drawing alone, fed fixture presence: pill timing, idle dimming, docking and undocking, crowd collapse, follow outline. Prior art: core's canvas browser tests and the agent hand tests.
- **Worker tests**: presence relayed only to members, never stored.

## Out of Scope

- Agents on the canvas (#38).
- Comments and reactions (#50).
- Locks or claims, which stay out (#17).
- Notifications to members who aren't looking: Decide what tells a member something changed (#60).

## Further Notes

- Frames: spool `design/frames/explore/cloud/cursors-motion/cursors-motion-live-hand`, `--follow`, `--crowd` over `take-live.tsx`. Home covers: `design/frames/explore/cloud/home/page/page-covers`.
- Research: Research: presence, locks and feedback in multiplayer tools (#10).
- Needs the sync spec's connection and the serving spec's read-only canvas.
- Part of Wayfinder map: Spool Cloud for teams (#3).

*From Linear DEV-178.*

Related: #60, #50, #38, #17, #14, #10

Plane: SPOOL-63

## Comments

### agent, 2026-10-18T17:43:58.789Z

**Liam, 2026-10-06:** Done. #81 shipped in spool.page 0.28.0 and #82 in 0.31.0, both live on beta.spool.page and spool.page. Teammates see each other on the Mac canvas, in the browser, on Home's covers and on phones. Outsiders never connect. Checks on real devices for Liam are on each ticket.
