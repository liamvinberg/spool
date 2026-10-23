# #212 · spool.page takes a frame's picture itself when no Mac has sent one

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-22T10:33:43.327Z
- Updated: 2026-10-22T11:31:25.762Z
- Closed: 2026-10-22T11:31:25.762Z

## Why
Pictures (covers) on spool.page only come from Macs: a daemon's photo booth shoots every frame of the projects open on that Mac and sends each still up (`src/daemon/team-covers.ts`, the cloud's `PUT /api/teams/:team/projects/:project/covers/:source`). When no up-to-date Mac has a project open, its frames have no picture, and the viewer shows an empty placeholder. Examples: an old project, a laptop closed before it sent, a backup restored on spool.page. In task 210, most projects had few or no pictures (chamfer 1 of 614). A stopgap daemon on devobee (`~/.spool-covers`, systemd `spool-covers` + `spool-covers-follow.timer`) keeps them filled for devosurf for now.

## What
Keep Macs as the main source, and add a fallback in spool-cloud: a frame that has no cover of its current version some minutes after it changed (or ever) is shot by spool.page itself, with Cloudflare Browser Rendering (a browser binding, Playwright or Puppeteer) loading the frame's document that the compile object already builds. The picture is filed exactly as a Mac's is, under the frame's version (`source`), so a Mac's later send of the same version is "known", the canvas socket gets `covered`, and the viewer swaps it in.

## Done when
- A frame with no current cover gets one within a few minutes, with no Mac involved. A test covers it, with the browser stubbed.
- The picture matches a Mac's: same size and framing as the booth's stills (read `src/daemon` booth code for viewport, scale, scheme and format), so the canvas doesn't jump between a Mac picture and a cloud one.
- Cost stays bounded: shots are batched in a single browser session, deduped per version, and capped per project per hour. One project's backlog (hundreds of frames) can't starve others. Workers Paid includes 10 browser hours a month, then $0.09/hour; normal use should stay inside the free hours.
- Shipped: spool-cloud merged and deployed to production (`ssh m1 'cd ~/projects/deploy-124/private && ./run.sh production'` after updating `~/projects/deploy-124/spool-cloud` to main and installing). If spool itself needs a change, ship it through the Changesets release, then bump the cloud pin and deploy again.
- Once it is live and verified on a real project, the devobee stopgap is stopped and disabled.

Asked for by Cata in task 210.

## Comments

### agent, 2026-10-22T11:31:25.762Z

Shipped in task 216. spool-cloud main c2c931a, deployed to production (versions 028f5607, then 9fd28340 with the fix below).

- **TeamCoverBooth**: one Durable Object for the whole cloud that shoots with Browser Rendering (@cloudflare/puppeteer). It loads the frame's own onspool.page host with a 120 s cover grant and files through the same fileCover as a Mac, so it uses the same source and sends `covered`.
- **Grace**: 5 min after a save; 2 min after a covers read finds a frame with no current cover.
- **Limits**: 120 shots per project per hour; 4 frames per project per turn; at most 60 shots or 150 s per session, with 30 s between sessions; 15 browser-minutes a day.
- **Fix found live**: the edge weakens the ETag of a brotli-compressed document (`W/"…"`), so the version check threw away every shot as "moved". It now strips `W/`, and the stubbed test serves weak ETags.
- **Verified**: on a test team project (devosurf/check) with the Mac's camera disabled, both frames were filed about 5 min after the save. The cloud still matches the booth's at 800x500 with the same framing. On notaker, 5 real frames saved with no Mac were filed in one 9.7 s session.
- **Stopgap retired**: devobee's spool-covers.service and spool-covers-follow.timer are stopped and disabled. ~/.spool-covers is left on disk.
- **Left over**: devosurf/check needs removing by a team admin, since the agent account is an editor.
