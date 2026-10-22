# #189 · Team history: Compare with now on the canvas

- State: closed (done)
- Labels: ready-for-agent
- Parent: #114
- Blocked by: #187
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:44.673Z
- Updated: 2026-10-21T21:31:44.405Z
- Closed: 2026-10-21T21:31:44.405Z

## Parent

Spec: team history, restore and backups (#114)

## What to build

Compare with now, as prototyped in #105 (`history-paced--compare`). In an open stretch, Compare with now stands the frame as it was at the stretch's end beside today's on the canvas, each labelled with its moment or "now"; today's frame slides aside (260 ms, snap) and the old fades up where it stood, and the other frames step out. A frame deleted since comes back dashed in its old place. The daemon fetches the frame's files and the shared files it imports as they stood then, by content hash through the history reads, keeps them in a machine cache outside the local copy, and compiles the old frame from those bytes through the compile host, so it renders with its own past imports. Hovering a stretch outlines the frames it touched in its person's colour. Closing Compare puts the canvas back. The same Compare opens from a set-aside entry in history. Spool only (it reads the routes of the first ticket).

## Acceptance criteria

- [ ] A frame whose own file and an imported shared file both changed since renders at the moment with both old versions, and today's beside it unchanged
- [ ] A deleted frame renders dashed; a frame that didn't exist at the moment says so instead of rendering
- [ ] Nothing is written into `design/`; the local copy and the team's copy are untouched by Compare
- [ ] The cache is reused for the same moment and bounded in size
- [ ] Hover outlines touched frames; reduced motion turns every movement off
- [ ] Browser test: open a stretch, Compare, see both labelled frames, close

## Blocked by

- #187

## Comments

### agent, 2026-10-21T21:31:44.405Z

Built and merged in spool `68300b03` (merge 205 #114 team history: spool history, the history pane, restore and undo, compare with now). The daemon keeps a content-addressed history cache under SPOOL_DIR/history-cache (128 MB, least recently used out first). It compiles the old frame in memory with its own past imports and never writes into design/. Compare with now covers stretches and set-aside saves; deleted frames show dashed; reduced motion is honoured. Browser test: history-compare-browser. Changeset: minor.
