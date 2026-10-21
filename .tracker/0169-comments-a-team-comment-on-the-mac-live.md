# #169 · Comments: a Team comment on the Mac, live

- State: closed (shipped in 0.44.0 and deployed)
- Labels: ready-for-agent
- Parent: #167
- Created: 2026-10-20T06:52:21.732Z
- Updated: 2026-10-20T17:57:30.074Z
- Closed: 2026-10-20T17:57:30.074Z

## Parent

Spec: comments on Spool Cloud (spool#167)

## What to build

The first path through every layer. An editor on the Mac picks the Comment tool (a fourth icon beside Select, Edit and Hand; C switches, holding C borrows and returns to the tool you had, V or Esc leaves), frames go inert, the pointer is a pin and the element under it is outlined. A click places a pin on the frame in the frame's own pixels, or on the page's empty field, and opens the composer card at it with the element chip; Enter sends. Placing hands back the Pointer. The comment is stored in the project's sync object, in its own tables outside the save path (ADR 0011): no bucket token, no month count, no history row, no compile wake-up. Every other Mac and member browser on the project hears it live. Clicking a pin under any tool opens the card with the comment, its replies in order and a reply field. Audience is Team only here; pins are plain faces (author initial in their presence colour, 22 px at every zoom, square-cornered for agents later), with no merging yet. The comment messages and validators join the shared sync protocol (`spool.page/sync-protocol`) and its version goes up. The daemon keeps its last snapshot in its own machine state, so the canvas shows comments offline and after a restart, and the composer says it's offline and won't post.

## Acceptance criteria

- [ ] A comment placed on one Mac appears live on another Mac on the same team project, at the same point on the same frame
- [ ] A comment on a page's empty field stands at its world point; a click on a page object still goes inside the page
- [ ] Replies show in order in the card and arrive live
- [ ] Posting a comment takes nothing from the save bucket or month count and adds no save to the history
- [ ] Offline, the Mac shows the last comments it heard and refuses to post with an offline notice
- [ ] The element's four handles, the frame's source revision and its still are stored with each comment
- [ ] Worker tests in spool-cloud drive the comments over the real sync object; the fake spool.page in spool's team sync harness learns the same messages; browser tests drive C, held C, V, Esc, placing and the card
- [ ] A changeset lands for the Mac's Comment tool

## Blocked by

None (can start immediately)

## Comments

### agent, 2026-10-20T08:53:38.517Z

Landed on the spec branches (spool and spool-cloud `191-167-spec-comments-on-spool-cloud`). Handoff: /tmp/pi-orch/spec-191/handoffs/t169.md. Protocol raised to 2; the comments snapshot lives under SPOOL_DIR/comments/.

### agent, 2026-10-20T17:57:30.074Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.
