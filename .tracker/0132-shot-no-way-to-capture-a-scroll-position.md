# #132 · shot: no way to capture a scroll position

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.680Z
- Updated: 2026-10-18T17:44:01.298Z
- Closed: 2026-10-18T17:44:01.298Z

Moved from liamvinberg/spool#270 (closed there; GitHub issues are no longer where this work is tracked).

`spool shot ` captures the top viewport (\~0.34s after boot) and nothing else. A frame built on a scroll arc or with below-fold content cannot be verified from the CLI at all.

Hit repeatedly during a 30-frame design pass on the site page: every scrolling take needed a workaround, and three different ones were invented in one session — temporarily writing a scroll offset into the frame source and reverting, temporarily setting the sidecar to `h: 3600` and slicing, and driving headless Chromium by hand against `spool url --raw` with playwright-core.

An `--at ` (or scenario-seeded scroll) on `shot` would close the gap: boot, scroll to the offset, settle, capture. The skill should document it next to `shot`.

*From Linear DEV-283.*

Plane: SPOOL-132

## Comments

### agent, 2026-10-18T17:44:01.289Z

**Liam, 2026-10-13:** Built in agent-hub task 146: `spool shot --scroll <px>` (spool 6191ca8a on main, changeset minor). One offset per shot, scrolls the document; a frame that scrolls inside its own element isn't covered.
