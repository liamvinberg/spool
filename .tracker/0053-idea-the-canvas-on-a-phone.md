# #53 · Idea: the canvas on a phone

- State: open
- Created: 2026-10-18T17:43:55.799Z
- Updated: 2026-10-18T17:43:55.799Z

Taken out of the Spool Cloud for teams map on 2026-10-04 by Prototype the team canvas on a phone (#47). The first paid version gives a phone the navigator and play only. Liam wants this surfaced again and iterated on: the prototype is better than what v1 ships.

The idea: spool on a phone keeps the canvas, put under the thumb. It's drawn as `reach` and was run against real projects: spool's own 983 frames on 122 pages nested five deep, chamfer's 614, securesend, and cat-tracker. Those showed that most frames are desktop-sized, a page is a grid often 30 frames wide, and some frames are pages thousands of pixels tall. What reach does:

- The page reflows like a website. Rows (takes) and their order stay, each row wraps to two desktop or three phone frames a line, and the gaps close up. The page view is a contact sheet that scrolls with momentum.
- The camera rests on one frame or the page. A swipe in any direction lands on the nearest frame that way. A long frame fits the width and scrolls, and pulling past its end hands over to the next frame.
- One bar at the bottom shows where you are (`spool · …/canvas` / frame), a map of the page's real layout, and who's here. Tap the map for the page. Drag on it and a big map opens over the thumb, with the camera landing on each frame crossed. The bar opens the navigator: recent, the page tree a level at a time, and find.
- Play runs the real frame. It's left by pulling from the right edge, the one strip a frame rarely claims and where a right thumb rests. Turning the phone is desktop mode: the bar steps away, a desktop frame plays at its authored size, and turning upright leaves.

Open when this is picked up:

- Reflowing shows the team's order but not their arrangement. Whether someone who arranged the canvas expects to see it on a phone.
- Desktop frames played upright are small. As authored and scaled, or at the phone's width so a responsive frame reflows.
- Whether this belongs in a native app (Idea: a Spool phone app for trying prototypes like a native app (#2)) or stays on the web, and whether it works for local projects.
- It wasn't felt on a real phone before this was split off.

Prototype:

- Frames: spool `design/shared/ui/explore/cloud/canvas/reach.tsx` over `phone.tsx`, frames `explore/cloud/canvas/phone/phone-reach*`, commits `cb234074`, `706ea380` and `8218d183`.
- Tooling: spool-cloud branch `prototype/dev-161-phone-canvas` (`9409299`).
- Live while it lasts: <https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/phone-canvas/>

Related: Idea: recent changes as a way into a project (#52).

Nothing is decided.

*From Linear DEV-167.*

Related: #62, #52, #47, #3, #2

Plane: SPOOL-53
