# #76 · Tracer: a member plays a team frame in the browser

- State: closed
- Labels: ready-for-agent
- Parent: #62
- Blocked by: #67, #71
- Created: 2026-10-18T17:43:56.030Z
- Updated: 2026-10-18T17:43:59.324Z
- Closed: 2026-10-18T17:43:59.324Z

## Parent

#62

## What to build

A compile Durable Object per team project, separate from the sync object, imports core's compile entry from the latest `spool.page` release with esbuild-wasm and the JS scanner. It compiles a frame when someone opens it from the source the sync object holds, keys output by a hash of its inputs, merges pending versions into the newest, stores output in its SQLite, and serves it from `onspool.page` behind the edge cache. Access is checked per frame. Core's package ships a read-only canvas build (pages rail, the viewer's own camera, live frames, click to grow into the player with the 30px bar, URL following page and played frame; no tools, dock, agent or selection; nothing writes) that the cloud serves at `spool.page/<team>/<project>/<page>` for members. Members see the real compile error with file and line. A compile hitting a Cloudflare limit is a compile error and raises an alert. Output is kept while current or settled and 24 hours after last request.

## Acceptance criteria

- [X] Cloud compile output is byte-equal to the daemon's for fixture sets
- [X] In the harness, a member opens the canvas in a browser, pans, zooms and plays a frame
- [X] Frame code is served only from `onspool.page`, never `spool.page`
- [X] Nothing a viewer does sends a write
- [X] A non-member is refused
- [X] A broken frame shows its real error to members
- [X] JavaScript heap use measured against 128 MB and noted

## Blocked by

- #67
- #71

*From Linear DEV-191.*

Related: #3

Plane: SPOOL-76

## Comments

### agent, 2026-10-18T17:43:59.316Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0 (the viewer and the compile), with the compile object live on beta.spool.page and spool.page.

Heap against 128 MB, measured on Spool's own canvas, 150 frames compiled in one object:
- The first run found a leak in esbuild-wasm that kept 0.3 MB per compile. A local patch fixes it. Kept heap then stays at 6.5 to 6.7 MB.
- The peak is about 108 MB counting garbage (54 MB heap plus 54 MB esbuild memory), about 61 MB live. That leaves about 20 MB.
- Median compile 186 ms, p90 392 ms. Measured again on the published 0.28.0: about 107 MB at peak.

Decisions where the spec was silent:
- The browser canvas is a viewer built from the canvas's own parts. It sends no writes.
- The browser player plays each frame's own document, as the desktop does. Motion across walks isn't there yet.
- A frame opens with a 12 hour grant in its URL, checked on every frame.
- The scenario key isn't rotated when someone is removed.
- The esbuild leak stays a local pnpm patch.
- A compile that hits a limit, or whose object resets mid-compile, logs a compile\_limit line. Removing a project or purging a team clears its compile object.

Left:
- The compile-limit alert isn't made yet. Liam makes it in the Cloudflare dashboard (steps on #3).

Checks for Liam:
- [ ] Frames load in real Safari and Chrome on spool.page.
- [ ] After a day of Devosurf use, no exceededMemory for the compile object in Workers Logs.
