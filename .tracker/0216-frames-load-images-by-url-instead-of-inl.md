# #216 · Frames load images by URL instead of inlining them

- State: closed (shipped in 0.48.0 and spool-cloud 9dafd61)
- Labels: needs-triage
- Tasks: task 387 (#216 Storage for images and other large assets)
- Created: 2026-10-23T12:38:31.151Z
- Updated: 2026-11-02T23:28:45.897Z
- Closed: 2026-11-02T23:28:45.897Z

## Why

Frames inline every imported image into their document as base64, with a 512 KB budget per frame (about 384 KB of real image), after which the build fails. One photo can break a deck slide (#129). Storage itself is fine for now: files are kept once by hash, and a heavy team's year costs about $0.24 a month in the sync object's SQLite.

## Plan (task 387)

Core (spool.page):
- An imported image yields `/asset/<sha256>.<ext>`, the same in the daemon and the cloud compile. The image budget goes; the 25 MB sync limit is the only ceiling.
- The daemon serves those URLs on the render host: immutable cache, ETag, CORS `*`, SVG locked down; only hashes of files in a project's design/.
- Capture, export and covers fetch the images and inline them only inside the capture, so PNG export and covers keep their pictures. The booth waits for images before it shoots.
- The skill tells agents to save web-sized images, and `crossorigin="anonymous"` for canvas or WebGL.

Cloud (spool-cloud):
- The serving worker answers `/asset/<hash>` on a project's own t… host and on share s… hosts, from the compile object's copy of the source, streamed, edge-cached by hash. Only hashes in that project's current source (or a share's settled one).
- Bump the core pin, compile-parity, deploy.

Later, on a trigger (a project near 5 GB, video, or slow decks): blobs to R2, resized variants through Cloudflare Images (512/1024/2048/4096, AVIF/WebP), local variant cache.

Research: /tmp/pi-orch/assets-387/ (spool-map.md, cloud-map.md, research.md).

## Comments

### agent, 2026-11-02T20:48:54.569Z

Task 387: narrowed. Storage is fine for now (content-addressed, ~$0.24/month for a heavy team's year in DO SQLite). The real limit is the ~384 KB of images a frame can inline before its build fails, which decks (#129) will hit. This ticket now makes frames load images by content-hashed URL, locally and on spool.page. Moving blobs to R2 waits for a trigger (a project near 5 GB, or video).

### agent, 2026-11-02T23:28:45.897Z

Shipped (task 387). Core: spool.page 0.48.0 (npm, Mac app v0.48.0): imported images load from /asset/<sha256><ext>, no image budget, 25 MB per file; the daemon serves them on the render host; the frame runtime adds crossOrigin itself; capture/export draw images at shown size; covers wait for images; old team versions serve images from the history cache. Cloud: spool-cloud 9dafd61 deployed to production (D1 migration 0042 frames_label): /asset on t… and s… hosts from the compile object's source, edge-cached, hash scoped to the project's current or settled source; the cloud camera waits for images. Verified in prod: devosurf/spool system/display loads its webp from /asset/ (200, 46 ms, one fetch for 7 uses), crossOrigin anonymous, canvas readable, immutable/ETag/ACAO/nosniff headers, 404 for an unknown hash and for another project's host. Later on a trigger: blobs to R2, resized variants via Cloudflare Images.
