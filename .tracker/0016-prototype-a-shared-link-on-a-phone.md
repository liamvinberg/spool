# #16 · Prototype a shared link on a phone

- State: closed
- Labels: wayfinder:prototype
- Parent: #3
- Blocked by: #9
- Created: 2026-10-18T17:43:55.443Z
- Updated: 2026-10-18T17:43:57.505Z
- Closed: 2026-10-18T17:43:57.505Z

## Question

How does a shared prototype open on a phone so it feels as close to a native app as the web allows: full screen, on the home screen, safe areas, no browser bars, natural scrolling and gestures, and what the first open asks of the person? Tried on a real phone. A native Spool app is out of this map (Idea: a Spool phone app for trying prototypes like a native app (#2)).

*From Linear DEV-115.*

Related: #47, #61, #62, #15, #2

Plane: SPOOL-16

## Comments

### agent, 2026-10-18T17:43:57.489Z

**Liam, 2026-10-04:** Head start from Prototype the read-only cloud canvas (#15). The canvas on a phone was moved here from that ticket.

There are four takes on what the canvas becomes at 390 wide, each with three states. They're in spool `design/frames/explore/cloud/canvas/phone/`, over `design/shared/ui/explore/cloud/canvas/phone.tsx`, commit `31690652`. Nothing has been picked.

- `phone-canvas`: the same canvas, touch first (drag, flick, pinch), with pages in a sheet pulled up from a crumb.
- `phone-shelf`: each page is a row of its frames you swipe sideways. The canvas is one push away, and a swipe from the left edge pops it.
- `phone-deck`: one big frame at a time, swiped in thread order. Pages are one step out, like the app switcher.
- `phone-list`: a native list (changed today, then pages), where a page pushes its canvas.

Play is the same in all four. The frame grows from its card to the whole screen, the browser bars go, the frame keeps its buttons above the home indicator, and a swipe down shrinks it back. Whether a browser tab can really drop its bars is still this ticket's question.

### agent, 2026-10-18T17:43:57.496Z

**Liam, 2026-10-04:** ## Resolution (prototype with Liam on his iPhone 17 Pro, iOS 27, 2026-10-04)

**A shared link opened from the Home Screen feels like a native app.** It runs full screen with no browser bars. The frame learns the real notch and home bar, and push, shared-element and gesture motion work across walks. Liam: "feels pretty good", then "looks good" on the music app.

- **The shell is spool's.** A frame can't reach the page around it, so the export adds:
- a name (today it's the frame's full path) and an icon
- a web app manifest, `theme-color` and `apple-mobile-web-app-status-bar-style: black-translucent`
- no width cap on phones (today it caps at the authored width, which leaves strips on a 402-wide phone)
- a frame that fills the whole screen when opened from the Home Screen

On iOS 27 from the Home Screen, the page reports 812 of the 874-point screen yet starts under the status bar. So `100dvh` falls short, and the export's `body{height:100%;overflow:hidden}` crops the frame. The fix is a fixed iframe at `100vh`, and Liam confirmed it on the device.
\* **The frame owns its safe areas.** Measured on the device, the frame inside the iframe gets the same insets as the page around it: 62 top and 34 bottom. So the frame fills the screen and pads itself with `env(safe-area-inset-*)`. The skill should say so for phone frames.
\* Rejected: `padded`, where spool keeps the frame between the notch and home bar and paints those strips. It isn't needed, because the insets reach the frame.
\* Rejected: `scroll`, where the page scrolls so Safari can shrink its bars. It breaks every sticky header and fixed bottom bar.
\* **The first open.** On a phone, in the browser only and only once, a card says who shared it and when it last changed. It explains how to add it to the Home Screen (··· → Share → Add to Home Screen; iOS has no way to prompt) and has one "Open it here" button. It never blocks the prototype. Agreed with Liam.
\* **Native feel is in reach of an agent.** Tonal, a music app built from Mobbin references (Apple Music, Spotify, Sonos), is two frames with real walks between them:
\* iOS push and pop through `transitions.css` view-transition types
\* album art flying between the card and the page through a shared `view-transition-name`
\* a tab bar and mini player that stay put across a walk
\* a mini player that grows into Now Playing and drags back down
\* a stretchy header, long-press menus, and haptics through the `<input switch>` trick
\* an edge swipe back that follows the finger, drawn by the frame itself, which renders the previous page underneath and walks back with the transition switched off

Whether the haptic and the edge swipe hold up on the device wasn't reported separately. Liam's verdict covered the whole app.

**Not covered:**
\* Android. Only iPhones are on the tailnet.
\* Per-publication origins. The test ran on one tailnet origin, while real links are each `p….onspool.page`, so each prototype is its own Home Screen app.

**Out of this ticket:**
\* The read-only team canvas on a phone went to its own ticket, Prototype the team canvas on a phone (#47), with the four takes as a head start.
\* Whether spool's player should give phone frames iOS push, pop and edge swipe by default, rather than each agent drawing them, is a core-player question beyond this map.

**Assets:**
\* Frames: spool `design/frames/explore/cloud/phone-link/` (`tonal-home`, `tonal-album`) over `design/shared/ui/explore/cloud/phone-link/tonal.tsx`, plus the `[data-tonal]` rules in `design/shared/transitions.css`. Commits `7001fd0a` (the naive walk), `9bd30f79` (Kaffebar with native motion) and `e04aaae6` (Tonal).
\* Shell and probe: spool-cloud branch `prototype/dev-115-phone-link` (`0843dfa`).
\* Live while it lasts: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/phone-link/
