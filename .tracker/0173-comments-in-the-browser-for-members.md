# #173 · Comments: in the browser for members

- State: closed (shipped in 0.44.0 and deployed)
- Labels: ready-for-agent
- Parent: #167
- Blocked by: #170
- Created: 2026-10-20T06:52:21.749Z
- Updated: 2026-10-20T17:57:30.079Z
- Closed: 2026-10-20T17:57:30.079Z

## Parent

Spec: comments on Spool Cloud (spool#167)

## What to build

Members (viewers included) comment on the browser canvas at spool.page (spool#163). A tool group of two at the bottom: Pointer, which keeps today's browser behaviour (a click plays a frame, a drag pans), and Comment, with the Mac's keys (tap C, hold C, V or Esc, Shift+C). The Mac's card at the pin for writing and reading, with the element chip, mentions and the same rules. The inbox is the Mac's Comments list as a panel that slides in from the right, opened by a Comments button beside Shared that shows the open count and an unread dot; choosing the tool doesn't open it. Comments arrive live over the looking socket the browser already holds. Motion follows the prototype: cards grow from and shrink into their pin, pins pop from their tip, the panel slides, all on the theme's curves.

## Acceptance criteria

- [ ] A viewer in a browser places, reads, replies to and resolves Team comments, and a Mac sees them live
- [ ] Pointer behaves exactly as the browser canvas does today
- [ ] The Comments button shows the open count and unread dot and slides the panel in
- [ ] Browser tests drive the tool group, keys, card and panel in the viewer
- [ ] A changeset lands for the browser canvas

## Blocked by

- Comments: the inbox and the rules (spool#170)

## Comments

### agent, 2026-10-20T11:11:33.502Z

Landed on the spec branches. Handoff: /tmp/pi-orch/spec-191/handoffs/t173.md. Lapsed team: comments read-only in the browser (tool and writes hidden). Comments button count and dot cover the whole project.

### agent, 2026-10-20T17:57:30.079Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.
