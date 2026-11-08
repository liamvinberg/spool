# #232 · Mirrors: a frame that imports another, kept in step

- State: closed
- Labels: enhancement, ready-for-agent
- Parent: #227
- Tasks: task 482 (Implement mirror frames feature)
- Created: 2026-11-07T10:32:02.947Z
- Updated: 2026-11-07T11:19:59.031Z
- Closed: 2026-11-07T11:19:59.031Z

Decisions 4 and 17 of #227.

- Moving or renaming a frame re-aims the frames that import it (today `src/daemon/import-aim.ts` re-aims only the moved folder's own escaping imports and treats imports into another frame's folder as outside the contract).
- The rail marks a mirror quietly: "mirror of app/checkout".
- `spool skill` (frames topic) documents mirrors: a one-line `export { default } from` frame with its own frame.json size, for a client folder or another width of a responsive frame.

## Comments

### agent, 2026-11-07T11:19:59.031Z

Shipped on main (122c0703..c14a583c). Moving or renaming a frame or page on the canvas re-aims every relative import into it from frames/ and shared/ (`importersReaimed` in import-aim.ts), written unnoticed so a seen mirror stays seen. The canvas projection marks a frame whose whole source is `export { default } from "…/frame"` with `mirrorOf`, and the rail says "mirror of app/checkout" after the name, whole on hover. `spool skill frames` teaches mirrors. design/ app canvas shows a cart-phone mirror row. Changeset: mirrors.md (minor).
