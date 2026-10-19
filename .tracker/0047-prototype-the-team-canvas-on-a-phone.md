# #47 · Prototype the team canvas on a phone

- State: closed
- Labels: wayfinder:prototype
- Parent: #3
- Created: 2026-10-18T17:43:55.739Z
- Updated: 2026-10-18T17:43:58.366Z
- Closed: 2026-10-18T17:43:58.366Z

## Question

What does the read-only team canvas become on a phone, opened through a shared link from the Home Screen: how a person moves between pages, browses frames and plays one, all tried on a real phone? This is how spool itself looks on a phone. It builds on the shell decided in Prototype a shared link on a phone (#16) and the desktop viewer decided in Prototype the read-only cloud canvas (#15).

*From Linear DEV-161.*

Related: #52, #53, #62, #16, #15

Plane: SPOOL-47

## Comments

### agent, 2026-10-18T17:43:58.352Z

**Liam, 2026-10-04:** Head start. Four takes were drawn during Prototype the read-only cloud canvas (#15): `phone-canvas`, `phone-shelf`, `phone-deck` and `phone-list`, each with three states, in spool `design/frames/explore/cloud/canvas/phone/` over `design/shared/ui/explore/cloud/canvas/phone.tsx` (commit `31690652`). Nothing has been picked.

They draw a fake status bar and Safari bar at 390 × 844. To try them on a phone they need a version that drops the fake chrome, pads with `env(safe-area-inset-*)` and fills the real screen. Then they can be exported with `spool build` and wrapped in the `app` shell from Prototype a shared link on a phone (#16). Its tooling is on spool-cloud branch `prototype/dev-115-phone-link`, and it served the result over the tailnet with a phone that reports its own measurements.

### agent, 2026-10-18T17:43:58.359Z

**Liam, 2026-10-04:** ## Resolution (prototype with Liam, 2026-10-04)

**In the first paid version, a team canvas link opened on a phone gives the navigator and play, and no spatial canvas.** The canvas on a phone was prototyped as `reach`. Liam likes it and thinks it beats what v1 ships, but it's "spool on a phone" rather than a team feature, so it moved to Idea: the canvas on a phone (#53) to be surfaced again and iterated on.

- **What v1 shows on a phone.** The navigator from `reach`, as one screen in spool's own style (mono names, the rail's folders, small radii):
- **recent**: the latest frames, who saved each and when. A save while you look arrives as a toast above the bar (`jonas saved cart · show`).
- the pages, a level at a time with breadcrumbs, frame counts and who's in each part
- a find field over page and frame names
- Frames show as covers. The cloud already has covers from members' daemons and history to read recent from ("Decide what the cloud builds and serves", "Decide where a team's design lives and how changes travel").
- **Play** uses the shell from Prototype a shared link on a phone (#16):
- The frame grows out of its cover and runs live. A phone frame gets the whole screen and pads its own safe areas.
- **Leaving is a pull from the right edge.** The frame shrinks under the thumb back into its spot. That's the one strip spool keeps over a live frame: iOS back is the left edge, frames scroll vertically, and a right thumb already rests there.
- **Turning the phone is desktop mode.** It plays a desktop frame at its authored size, scaled to the screen, and turning upright leaves. Upright, a desktop frame plays whole and small, with `1440 × 900 · turn the phone`.
- **Recent** was the clearest find. Liam: "the recent will be a game changer", even solo. Its use beyond teams went to Idea: recent changes as a way into a project (#52).

**What real projects showed.** Measured across `~/projects` and run in the prototype on spool (983 frames, 122 pages nested five deep), chamfer (614), securesend and cat-tracker:
\* Most frames are desktop-sized: 850 of spool's 983, 511 of chamfer's 614.
\* A page is a grid, often a long row (spool's `explore/new-project` is 30 frames wide). Fitted to a phone, the page and its map become an unreadable strip, which is why `reach` reflows.
\* Pages run to 122, so moving between pages needs find and a tree, not swipes.
\* All 36 of spool's `app/` frames exported only with the navigation check switched off. That's more evidence for retiring it.

**Rejected:** the four first takes. `canvas` (free pan and pinch, chrome up top), `shelf` and `list` (iOS in costume: large titles, uppercase headers, "Canvas ›" links) and `deck` (one frame at a time but no canvas). They were deleted in `8cc0fef5`; git keeps them.

**Not covered:** none of it was felt on a real phone. It was driven headless at phone size: swipes, map scrub, navigator, live play, edge pull and turning the phone, with no errors. Android wasn't tried.

**Assets:**
\* Frames: spool `design/shared/ui/explore/cloud/canvas/reach.tsx` over `phone.tsx`, frames `explore/cloud/canvas/phone/phone-reach*`. Commits `552c58d3`, `cb234074`, `706ea380`, `8218d183` and `8cc0fef5`.
\* Tooling: spool-cloud branch `prototype/dev-161-phone-canvas` (`9409299`). It holds the real-project reader, the live exports and the app-shell build.
\* Live while it lasts: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/phone-canvas/
