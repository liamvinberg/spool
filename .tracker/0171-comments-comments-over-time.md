# #171 · Comments: comments over time

- State: closed (shipped in 0.44.0 and deployed)
- Labels: ready-for-agent
- Parent: #167
- Blocked by: #169
- Created: 2026-10-20T06:52:21.746Z
- Updated: 2026-10-20T17:57:30.077Z
- Closed: 2026-10-20T17:57:30.077Z

## Parent

Spec: comments on Spool Cloud (spool#167)

## What to build

Comments keep up with the frames and projects they stand on (spool#160 and the spec's "over a project's life"). The sync object keeps pins current as it applies saves: a rename or move to another page that Spool makes, and a delete and add of the same source within one save batch, repoint the comment; a duplicated frame or variant starts with none. A resize keeps the pin's pixel offset from the frame's top-left, clamped inside the frame. An edit leaves the pin put, and a comment whose revision differs from its frame's says "edited since" in its card and row, with Compare showing the still from then beside the frame now. A deleted frame drops its comments onto the page's field at its last place, dashed and marked as on a deleted frame, keeping their still; a save that brings a frame back at that path stands them on it again. A deleted page's comments leave the canvas and show only under Resolved, marked "page deleted". Comments aren't part of history: a restore never rolls them back. A lapsed team's comments are read-only for everyone, admins still read them on the cloud canvas and Macs keep their snapshot; paying again carries on. A project leaving the team deletes its comments with the team's copy, and the leave sheet says how many. A move to another team keeps them. A removed member's comments stay under their name. A deleted account's comments stay, shown as "Deleted account" with a plain face, its reads and settings gone.

## Acceptance criteria

- [ ] Renaming or moving a frame in Spool, or an agent's delete and add of the same source in one batch, keeps its comments on it; a duplicate has none
- [ ] Resizing keeps pins at their pixel offset, clamped inside the frame
- [ ] After an edit the comment says "edited since" and Compare shows its still beside the live frame
- [ ] Deleting a frame drops its comments dashed onto the field; restoring the frame at that path puts them back
- [ ] Deleting a page moves its comments to Resolved, marked "page deleted"
- [ ] A lapsed team can't post; paying again can
- [ ] The leave sheet states the comment count, and the comments are gone after the project leaves; a move between teams keeps them
- [ ] A deleted account's comments show as "Deleted account"
- [ ] Worker tests drive each case through saves and team operations against the real sync object

## Blocked by

- Comments: a Team comment on the Mac, live (spool#169)

## Comments

### agent, 2026-10-20T10:24:59.444Z

Landed on the spec branches. Handoff: /tmp/pi-orch/spec-191/handoffs/t171.md. Revision is a hash of the frame's own source only (frameRevision in sync-protocol); Cloud keeps comment.editedSince current.

### agent, 2026-10-20T17:57:30.077Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.
