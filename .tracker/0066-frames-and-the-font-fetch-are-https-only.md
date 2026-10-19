# #66 · Frames and the font fetch are https-only

- State: closed
- Labels: ready-for-agent
- Parent: #61
- Created: 2026-10-18T17:43:55.925Z
- Updated: 2026-10-18T17:43:58.953Z
- Closed: 2026-10-18T17:43:58.953Z

## Parent

#61

## What to build

Every document that runs frame code (canvas, player, `spool shot`, photo booth, export) gets a Content Security Policy that limits `connect-src`, `script-src` and `img-src` to `https:`, `data:`, `blob:` and the daemon's own vendored libraries, for solo and team projects alike. A frame calling `http://localhost:3000` or a LAN address is refused, and the frame's logs say what was refused. The daemon's web font fetch takes only `https:` URLs and refuses hosts that resolve to loopback, link-local, private or unique-local addresses, checking every redirect hop. The skill says frames are https-only and points at scenarios and mocks for faking a backend.

## Acceptance criteria

- [X] A frame on the canvas, in the player and through `spool shot` can't reach a plain-http server on loopback; the request never arrives
- [X] https requests, `data:` images and vendored libraries still load in all of those
- [X] The photo booth and exported documents carry the same policy (parity law holds)
- [X] `shared/fonts.css` pointing at `http:`, loopback, a private address or a redirect to one fetches nothing and logs the URL and reason; a public https font still works
- [X] `spool skill` has the https-only paragraph and the phone-frame safe-area sentence
- [X] Changeset added per `docs/releases.md`
- [X] Browser tests beside the existing security browser tests; daemon tests beside the web fonts tests

## Blocked by

None (can start immediately)

*From Linear DEV-181.*

Related: #3

Plane: SPOOL-66

## Comments

### agent, 2026-10-18T17:43:58.945Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0. Frames are https-only on the canvas, in the player, in spool shot and logs, in covers and in exported sites. The font fetch takes only public https addresses and checks every redirect. The 0.28.0 entry is minor and says Breaking.

Decisions where the spec was silent:
- The policy limits only the three things the spec names: fetch, scripts and images. Iframes, media, stylesheets and forms can still reach plain http. Kept as built.
- https to a LAN address is still allowed. Kept as built.
- "Vendored libraries" means the daemon's render address. It only answers render paths, so nothing more of the daemon is reachable.
- Exported sites carry the same policy as a meta tag.

Nothing left on this ticket.
