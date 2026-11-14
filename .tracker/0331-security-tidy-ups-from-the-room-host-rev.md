# #331 · Security tidy-ups from the room host review: pass keys, permissions for frames, frame CSP

- State: open
- Labels: needs-triage
- Created: 2026-11-13T08:39:24.360Z
- Updated: 2026-11-13T08:39:24.360Z

An independent Opus review (task 557, 2026-11-13, on main 9d4f5b85) of the room's own host (`room-spool.localhost`, #320) found it **safe as built**: a strict subset of the render host, exact host match, no CORS, passes single-use and tied to their host, same sandbox. It left one nit and three older weaknesses that the change did not widen. None is exploitable as built; all are cheap.

1. `src/daemon/deck/stage-play.ts:48` (`passKey`): passes are told apart by a string prefix and page names may contain `:`, so a room pass for page `talk` shares a key with a render pass for a page named `room:talk`. Use a separator a page name cannot hold, or store the host in the handoff record.
2. `desktop/src/main.ts:691-695` (`installPermissions`): says yes to every permission for any daemon URL, frames on the render and room hosts included (browser rules on cross-origin iframes limit it to what the iframe passes down). Restrict to the control host.
3. `/play/<p>/-/*` sends `access-control-allow-origin: *` (names are content hashes). Decide whether it needs to.
4. `frameCsp` sets no `frame-src` or navigation limit: slides can frame or navigate anywhere they could before. Decide what a frame should be allowed.

Not checked by the review: Chromium's process allocation for sandboxed opaque frames at runtime (performance, not security); Safari and Firefox on `*.localhost` (the room host is never used there). Belongs with the core rebuild's trust boundary (task 634) or a small builder.
