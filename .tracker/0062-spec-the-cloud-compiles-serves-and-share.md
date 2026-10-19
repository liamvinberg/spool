# #62 · Spec: the cloud compiles, serves and shares

- State: closed
- Labels: ready-for-agent
- Parent: #3
- Blocked by: #59, #61, #64
- Created: 2026-10-18T17:43:55.883Z
- Updated: 2026-10-18T17:43:58.751Z
- Closed: 2026-10-18T17:43:58.751Z

## Problem Statement

Sharing a prototype today goes through the beta's local exporter, a second pipeline with its own rules: its navigation check refuses 631 of 752 frames (a third falsely), it drops `?raw` imports, it takes 3 to 13 s, and the panel shows one problem with no location. A frame that plays on your canvas may not share. There's no way to look at a team's canvas in a browser: a viewer, a stakeholder, or an editor away from their Mac has nothing to open. A shared link on a phone opens with strips down the sides, the frame cropped, and no way to make it feel like an app.

## Solution

Spool Cloud compiles frames from source with core's own code when someone opens one, and serves them. If it plays on your canvas, it plays in the cloud. Sharing never refuses.

- **The read-only canvas in a browser** at `spool.page/<team>/<project>/<page>`: the shipped canvas with every authoring control taken off. The pages rail stays; your own camera; clicking a frame grows it into the player; nothing a viewer does writes anywhere.
- **Members** (viewers, or editors away from their Mac) see the team canvas live: a teammate's save shows up in place with the changed mark and a short toast, and "Open in spool" hands over to the Mac for editors.
- **Outsiders** see only the pages shared with them, once settled, and the last version that compiled. Other pages don't exist for them, and nobody sees them.
- **Shares** belong to the team: named people who sign in, or anyone with the link. A Shared control at the canvas's top right lists them; new shares start from right-clicking a page.
- **Solo projects** share the same way: the daemon uploads the source the cloud lacks.
- **On a phone**, a shared link opened from the Home Screen runs full screen like an app, and a team canvas link gives a navigator (recent, the page tree, find) and play.

## User Stories

### Compiling and serving

1. As a person sharing, I want any frame that plays on my canvas to play in the cloud, so that sharing never refuses.
2. As a person sharing, I want no navigation check before sharing, so that motion components and prop spreads don't block me.
3. As an author, I want `?raw` imports, assets, fixtures and scenarios to work in the cloud as they do locally, so that nothing is dropped.
4. As an author, I want pinned `importmap.json` libraries served by the cloud, so that shared frames don't depend on third-party CDNs at view time.
5. As a viewer, I want a frame compiled the first time someone opens it and kept after that, so that opening is fast after the first time.
6. As a viewer watching a player, I want the frames it links to compiled in the background, so that walking is fast.
7. As a viewer, I want a frame I've opened never to lose its files while my tab is open, so that a later save doesn't break what I'm looking at.
8. As a member, I want a frame that doesn't compile to show the real error with file and line, so that I can tell the author.
9. As an outsider, I want the last version that compiled instead of an error, so that a broken save doesn't break the link I was sent.
10. As an outsider opening a frame that never compiled, I want "This screen isn't ready yet", so that I know it's not my fault.
11. As a viewer, I want a runtime error in my browser to look like the local player's, so that it's familiar.
12. As Spool, I want frame code never to run on `spool.page`, only on `onspool.page`, so that the account origin stays safe.
13. As Spool, I want a compile that hits a Cloudflare limit treated as a compile error and alerted on, so that limits are visible and handled.

### The read-only canvas

14. As a viewer, I want the pages rail as it ships (team mark, project name, pages, frames under the open page), so that I can find my way.
15. As a viewer, I want frames on the field live with their threads and labels at a constant size, so that it reads like Spool.
16. As a viewer, I want my own camera: scroll pans, ⌘ or ctrl scroll zooms around the pointer, and zoom and fit at the bottom right, so that I can look around.
17. As a viewer, I want clicking a frame in the rail to glide the camera there, so that I can jump.
18. As a viewer, I want switching pages to crossfade quickly, so that it feels like the shipped canvas.
19. As a viewer, I want nothing on the canvas selectable and no tools, dock, agent or selection, so that it's clearly for looking.
20. As a team, I want nothing a viewer does written to anyone's project, so that viewing is safe even if a control slipped through.
21. As a viewer, I want clicking a frame to grow it into the player in the same tab, with the 30px player bar (frame switcher, size, eye, close), so that I can play it.
22. As a viewer, I want close to shrink the frame back into its place, so that I don't lose my spot.
23. As a viewer, I want the URL to follow the page and the played frame, so that copying it sends that view.
24. As a member, I want a teammate's save to appear in place with the changed mark and a short toast, so that I see work happening.
25. As a member in the player, I want the next screen to be the new version without moving me mid-flow, so that a save doesn't interrupt a walk.
26. As an editor in a browser, I want "Open in spool" to hand over to the Mac, so that I can edit.
27. As a viewer, I want "Open in spool" never shown, so that I'm not offered what I can't use.
28. As a person following a team project link with Spool installed, I want `spool.page/<team>/<project>` to knock on Spool on this Mac and hand over, so that links open the app.
29. As a person without Spool or on a phone, I want "Look in the browser", so that I can still see it.
30. As a member watching live in a browser, I want a teammate's save served in about 1.3 s, so that it feels live enough.

### Outsiders and shares

31. As an editor or admin, I want to share pages by right-clicking a page, so that sharing starts where the work is.
32. As a person sharing, I want to share with named people who sign in, or with anyone who has the link, so that I choose how open it is.
33. As an outsider, I want to see only the pages shared with me, with the others not existing for me, so that the team's other work stays private.
34. As an outsider, I want one line saying who shared it and when it last updated, so that I know what I'm looking at.
35. As an outsider, I want to be invisible, seeing nobody and seen by nobody, so that a client view stays calm.
36. As an outsider following a link to a screen not shared with me, I want "This screen isn't shared with you", so that the boundary is clear.
37. As an outsider, I want to see a page once it's settled (the writer's agent finished its turn, or about 30 s passed with no saves), so that I never see half-done work.
38. As a person sharing, I want the flow map to warn me about links that leave the shared pages, never blocking, so that I can widen the share if I want.
39. As a member, I want a Shared control at the canvas's top right listing each share ("kim and ola" or "anyone with the link") and its pages, so that I know who can see what.
40. As a member, I want a share row to open to its people (add and remove), who made it, when, how often it was opened, and Stop sharing, so that I can manage it.
41. As a member stopping a share, I want access to stop at once, so that stopping means stopping.
42. As a viewer, I want to see share rows but not change them or copy the link, so that only editors manage sharing.
43. As a team, I want shares owned by the team, outliving the member who made it, and changeable by any editor or admin, so that a departure doesn't break client links.
44. As a person sharing, I want a link share to carry its pages together and a new share always to get a new URL, so that stopping one share never affects another.
45. As a solo person, I want to share pages of my local project the same way, with my daemon uploading the files the cloud lacks, so that sharing works without a team.
46. As an outsider signing in, I want the same sign-in page with Google or a code, so that it's simple.

### Covers

47. As a member, I want covers in the cloud to come from members' daemons, so that the cloud never photographs frames.
48. As a team, I want a cover for a version uploaded once by whichever daemon shot it first, so that we don't duplicate work.
49. As a solo person sharing, I want my covers to travel with the source, so that shared pages have covers.

### A shared link on a phone

50. As a person on a phone, I want a shared link to have a name, an icon and a web app manifest, so that I can add it to my Home Screen as an app.
51. As that person, I want it to open full screen with no browser bars from the Home Screen, so that it feels native.
52. As that person, I want no width cap on phones and a frame filling the whole screen, so that there are no strips or cropping.
53. As an author of a phone frame, I want the frame to get the real safe-area insets and pad itself, so that it looks right around the notch and home bar.
54. As a person opening a shared link in a phone browser for the first time, I want a once-only card saying who shared it, when it last changed, how to add it to the Home Screen, and "Open it here", so that I can get the app feel without being blocked.
55. As an author, I want push, shared-element and gesture motion to work across walks on the phone, so that native-feeling prototypes stay native.

### A team canvas on a phone

56. As a member on a phone, I want a team canvas link to give a navigator instead of the spatial canvas, so that I can find frames on a small screen.
57. As that member, I want a recent list of the latest frames, who saved each and when, so that I see what changed.
58. As that member, I want a save while I look to arrive as a toast ("jonas saved cart · show"), so that I see live work.
59. As that member, I want the pages a level at a time with breadcrumbs, frame counts and who's in each part, so that I can browse 100+ pages.
60. As that member, I want a find field over page and frame names, so that I can jump.
61. As that member, I want frames shown as covers, so that I recognise them.
62. As that member, I want play to grow the frame out of its cover and run it live full screen, so that I can try it.
63. As that member, I want to leave by pulling from the right edge, so that iOS back and the frame's own gestures still work.
64. As that member, I want turning the phone to play a desktop frame at its authored size scaled to the screen, and turning upright to leave, so that desktop frames are usable.
65. As that member, I want an upright desktop frame to play whole and small with its size and "turn the phone", so that I know what to do.

## Implementation Decisions

- **Compile Durable Object per project**, separate from the sync object (Decide where the cloud compile runs (#56)). It imports core's compile entry from the `spool.page` package at its latest release (from the core spec), with esbuild-wasm and the JS scanner. It reads source from the team project's copy (or a solo share's uploaded source), compiles on open, keys output by a hash of its inputs, and merges pending versions into the newest. Output lives in the object's SQLite and is served through the edge cache from `onspool.page`. Output is immutable by hash. Output is kept while it belongs to a current or settled version, and for 24 hours after it was last requested, so an open tab never loses its files. #56 left retention to the spec; this is the spec's choice.
- **Access** is checked per frame when it's opened: member of the team, or outsider with a share covering the frame's page. The beta's navigation check, its local exporter and the required `links` export retire. `links` stays as an optional hint for arrows.
- **Settled.** The cloud moves a page's settled version forward when a writer's daemon reports its agent's turn ended (from the sync spec) or after about 30 s with no saves to that page. Members always get the latest.
- **The read-only canvas is core's canvas.** Core's package ships a read-only canvas build (no tools, dock, agent, selection or writes) that the cloud serves on `spool.page`, fed by the cloud's API instead of a daemon. One canvas codebase, as one compile pipeline. Motion uses the shipped canvas's own timings, per #15's follow-up.
- **Shares.** A share belongs to a team project: a set of pages, a kind (named people or anyone with the link), its maker, created and opened counts. A link share gets a fresh unguessable URL on its own `onspool.page` host, so each share is its own Home Screen app on a phone and a new share never reuses a URL. Named-people shares require sign-in as one of the named addresses. The Shared popover and share creation follow Prototype signing in and running a team (#44).
- **Solo shares** upload source the cloud lacks (content-addressed) and the covers of shared frames. The cloud keeps a solo share's source only for what it serves.
- **Covers** are uploaded by members' daemons from the photo booth, filed by content hash; the first upload of a hash wins and others skip.
- **Phone shell** from Prototype a shared link on a phone (#16): name, icon, manifest, `theme-color`, `apple-mobile-web-app-status-bar-style: black-translucent`, no width cap on phones, a fixed iframe at `100vh` (not `100dvh`), and the once-only first-open card. The frame pads itself with `env(safe-area-inset-*)`.
- **Phone navigator** from Prototype the team canvas on a phone (#47): recent (read from the team's history), the page tree, find, covers, play with the right-edge pull to leave and rotation for desktop frames. No spatial canvas on a phone.
- **Handoff** from `spool.page/<team>/<project>` to the Mac uses the same knock as `local.spool.page`.
- **Blocked on** Decide what happens to the beta's publications and links (#59): this spec retires the beta's exporter and publication pipeline, so what happens to existing publications must be decided first.

## Testing Decisions

- Test what a viewer, outsider or sharer sees and can reach, never how compile output is stored.
- **Team harness** (the end-to-end seam): a daemon saves; a browser viewer sees the change in place; an outsider with a share sees only shared pages, gets "This screen isn't shared with you" elsewhere, sees the settled version, and the last compiled version after a broken save; a member sees the real error; stopping a share cuts access at once; a solo share works with no team. Prior art: spool-cloud's publication e2e tests (viewer, rendering, player-share).
- **Worker tests** for the compile object and access: byte equality with the daemon's compile on fixture sets; compile on open and background compile of linked frames; per-frame access for members, named outsiders, link shares and strangers; settled advance on turn end and on quiet; limit failure becomes a compile error. Prior art: the publication app, viewer and updates worker tests.
- **Core tests** for the read-only canvas build: a browser test that nothing selects, no tool or dock appears, and no request writes. Prior art: core's canvas browser tests.
- **Phone shell:** a browser test at phone size that the manifest, icon, meta tags and full-height iframe are present and the frame receives safe-area insets. Real-device checks stay manual, as in #16.

## Out of Scope

- What happens to the beta's existing publications and links: Decide what happens to the beta's publications and links (#59).
- Comments and reactions (#50), the spatial canvas on a phone (#53), recent changes on the desktop (#52), a native phone app (#2), branch builds.
- A native compile service, unless browser viewers find the wait a problem.
- Live cursors and who's looking: the presence spec.
- Whether a share's maker hears when someone else stops it: Decide what tells a member something changed (#60).

## Further Notes

- Sources: Decide what the cloud builds and serves (#18), Decide where the cloud compile runs (#56), Prototype the read-only cloud canvas (#15), Prototype a shared link on a phone (#16), Prototype the team canvas on a phone (#47), Prototype the team's home (#22), research #4, #8, #41, #42.
- #56 left these to the spec: JavaScript heap use against 128 MB in the compile object, and how long compiled output is kept.
- Frames: spool `design/frames/explore/cloud/canvas/` (`viewer-rail` and states, `phone/phone-reach*`), `phone-link/`, `team/shares/`.
- Vocabulary: Settled, Outsider are in spool-cloud's glossary.
- Needs the core spec's compile entry and the accounts spec. Team canvases also need the sync spec.
- Part of Wayfinder map: Spool Cloud for teams (#3).

*From Linear DEV-177.*

Related: #65, #79, #80, #60, #56, #53, #52, #50, #47, #44, #42, #41, #22, #18, #16, #15, #8, #4, #2

Plane: SPOOL-62

## Comments

### agent, 2026-10-18T17:43:58.734Z

**Liam, 2026-10-06:** Stays open. #76, #77 and #78 are done, shipped across spool.page 0.28.0 to 0.31.0. #79 is live in 0.31.0 and waits only on Liam's iPhone check (steps on the ticket).

Left:
- #80 waits on #59 (Liam).
- The compile-limit alert still needs making in the Cloudflare dashboard. Steps are on #3.
- Motion across walks in the browser player (story 55) isn't built.

### agent, 2026-10-18T17:43:58.742Z

**Liam, 2026-10-11:** Closed on 2026-10-11 (agent-hub task 123): built, bar two tickets that stay open on their own: Retire the beta's exporter and move existing publications (#80) and Liam's real-iPhone check on Phones: the shared-link shell and the team canvas navigator (#79).
