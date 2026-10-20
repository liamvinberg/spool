# #160 · Decide what a comment is pinned to

- State: closed (resolved)
- Labels: wayfinder:grilling
- Parent: #155
- Tasks: task 180 (◆ #160 Decide what a comment is pinned to)
- Created: 2026-10-18T17:43:56.993Z
- Updated: 2026-10-19T19:33:09.738Z
- Closed: 2026-10-19T19:33:09.738Z

## Question

What does a comment attach to: a point on the canvas, a point on a frame, a dragged region, or the element under the point (the selection's four handles: frame path, source lines, selector, excerpt)? Can a comment sit on a page with no frame under it? What does it remember about when it was made (the frame's source version, a still of what the commenter saw, the scenario or the state the frame was walked into)? And what happens when its frame is edited, resized, moved, renamed, moved to another page or deleted? Evidence: `spool-cloud/research/109-presence-locks-feedback/` section on pins.

Plane: SPOOL-160

## Comments

### agent, 2026-10-19T19:33:09.738Z

## Resolution

Decided with Liam (Cata), 2026-10-18.

- **Anchor**: a pin is a point on a frame, in the frame's own pixels from its top-left, so it moves with the frame. If an element is under the point, its four selection handles (frame path, source lines, selector, excerpt) are stored with the comment as context for agents; the pin never follows the element.
- **No region drag, no plain canvas point.** A point only.
- **Off-frame**: a comment can sit on a page's empty field, at a world point on that page.
- **Page objects**: no comments on a page object. A click there goes inside the page as it does today, and the page object shows a count of the comments in it (the prototype draws it).
- **Where**: comments are placed on the canvas only, on frames as they stand. Not in the player or in an entered frame after walking or scrolling, for now.
- **Remembered**: the frame's source revision when the comment was made, and the still of that revision. Both exist already. No capture of what the commenter saw (a later attachment, maybe).
- **Moved**: the pin follows the frame.
- **Resized**: the pin keeps its pixel distance from the frame's top-left, clamped inside the frame. Web layouts flow from the top-left, so pixels hold better than percentages.
- **Edited**: the pin stays at its point. When the frame's revision differs from the comment's, the comment says it was edited since, and opening it shows the still from then. Pins don't chase elements: jumping between still and live and silent misses feel broken.
- **Renamed or moved to another page**: comments follow every rename or move Spool makes. A delete and an add with the same source in one save also count as a rename (an agent's `mv`). A duplicated frame or variant starts with no comments.
- **Deleted**: its comments drop onto the page's field at the frame's last place, marked as on a deleted frame, keeping their still.
- Left to Comments over time (map fog): page deletion, restore from history.
- Naming of the comment and pin stays with the Mac app prototype (#162).
