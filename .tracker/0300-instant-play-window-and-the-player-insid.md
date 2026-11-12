# #300 · Instant play window, and the player inside exported HTML

- State: open
- Labels: ready-for-agent, enhancement
- Created: 2026-11-11T21:22:56.713Z
- Updated: 2026-11-11T21:22:56.713Z

## Problem Statement

Pressing play on a frame in the Mac app feels slow: nothing happens for about a second, then the player window appears. Liam wants the window on screen the instant he presses, and is fine with the frame loading inside it after that.

Separately, an exported HTML file shows the frame bare. Someone who gets the file cannot resize it the way the player lets you: the size pill, the presets, the edges you pull with the pill that appears while pulling. Liam likes that part of the player a lot and wants the exported file to have it, without recording.

## Solution

1. **The play window shows at once.** In the Mac app a press on play puts the window on screen right away, at the right place and size, dark, with the edge bar's strip drawn. The frame arrives inside it. The app keeps one hidden spare window warm so this costs no start-up time.
2. **The frame arrives sooner**, in the Mac app and in a browser tab: the work the frame needs is started when the pointer shows intent, and round trips that only gate the first reveal are removed.
3. **One player, two hosts.** The player shell (edge bar, size pill, presets, edge pull, fit) stops assuming a daemon. Everything it needs from outside comes from its host: the live host (daemon, recording, the Mac window) or the export host (no daemon, no recording, sizes baked into the file).
4. **Export with player.** The export dialog's HTML choice gets a "With player" switch, on by default. The file then opens in the same player, minus what only makes sense live.

## User Stories

1. As someone designing in the Mac app, I want the player window to appear the moment I press play, so that playing feels like part of the canvas and not like launching something.
2. As someone designing, I want that window to open where and at the size it would have before (the remembered rect for this project and width, or fitted to the frame), so that instant does not mean misplaced.
3. As someone designing, I want the window to show its bar strip and dark page while the frame loads, so that I never see a white or empty flash.
4. As someone designing, I want the frame to be visible as soon as it can be, so that the wait inside the window is short too.
5. As someone playing in a browser tab, I want the same gains on the frame's arrival, so that the Mac app is not the only fast place.
6. As someone on a laptop, I want the spare window to cost nothing while it waits (no timers, no animation, no open connections), so that spool does not drain the battery to save me a second.
7. As someone designing, I want play to work exactly as before when the spare is missing or stale (app just started, daemon restarted, a remote project), so that the fast path is never a new way to fail.
8. As someone exporting HTML, I want a "With player" switch that is on by default, so that what I send can be resized by whoever opens it.
9. As someone exporting HTML, I want to switch it off and get today's bare file, so that I can still host or embed the page itself.
10. As someone who receives the file, I want to open it from disk with no internet and see the frame in the player with its name and size pill, so that I know what I am looking at.
11. As a receiver, I want to pick Phone, Tablet, Laptop, Desktop, As drawn or Window from the pill, so that I can see the design at those sizes.
12. As a receiver, I want to pull the frame's edges and see the same pill, readout, ticks and snapping as the live player, so that resizing feels as good as it does in spool.
13. As a receiver, I want the frame to really respond to its new size (media queries, viewport units), so that a responsive design shows its layouts.
14. As a receiver, I want links between the exported frames to walk as they do today, with the same transitions, so that the flow still plays.
15. As a receiver on a phone, I want no bar at all and the frame filling my screen, so that the player does not get in the way where there is nothing to resize.
16. As a receiver, I do not want to see record, close, copy link or comments, so that nothing in the bar is dead.
17. As a maintainer, I want the player's chrome and sizing to exist once, so that a change to the pill or the pull shows up in the live player and in exports together.

## Implementation Decisions

- **Measure first.** The play path gets timing marks: press received, window shown, shell painted, frame revealed. The Mac app logs them per play. Nobody has timed where the second goes; the marks are how each change below is kept or dropped, and the numbers before and after go in the handoff.
- **No awaited request between the press and the window showing.** Today the main process asks the daemon for the frame's size before it makes the window, then keeps the window hidden until first paint or one second. Both go. The size comes from something already in hand at press time.
- **Warm spare.** While a canvas is open in the Mac app, one hidden play window is kept ready on the same origin with the same preferences. A press adopts it: placed, titled, shown, then pointed at the play URL. A new spare is made once the adopted window has revealed its frame, so refilling never competes with a play. One spare at most. It is not a window to the rest of the app: it does not keep the app alive, appear in window lists or menus, or take focus.
- **Fallback is "show first".** When there is no usable spare, the window is created and shown at once, dark, and loads as today. Chosen over waiting for paint because Liam prefers an instant dark window to a late complete one.
- **Isolation and handoffs do not change.** Authored frame code still runs only on the render origin, behind a single-use handoff minted for that play. The spare never holds a handoff or anything minted ahead of time for a frame.
- **Arrival sooner.** Warm the frame's playable when the pointer shows intent to play, not only on the canvas-open timer. The outer document preloads the shell and React. The default scenario seed and the frame's geometry travel with the documents, so the first reveal waits on no extra fetch; live geometry updates still arrive after. The runtime bundles are minified.
- **Left alone on purpose:** the arrival motion (the dissolve, the spool mark after a long wait) and the reveal gates that stop wrong-size first paints. They are tuned and tested; change them only if the marks show they cost real time, and say so.
- **Player shell and hosts.** The shell core keeps the chrome, sizing, fit and the port protocol with the played document. The existing host interface becomes the only way out. Live host: daemon geometry and its stream, verified walks, handoff repair, recording, the Mac window bridge. Export host: fixed geometry from the file, no walk reporting, no repair, no recorder. What a host does not offer, the bar does not draw.
- **Exported file with player.** Outer document: the shell with the export host. Inner document: the packed composition that export builds today, booted the way the live player's inner document is, in a sandboxed iframe so the frame gets a real viewport. Without the player the export is byte-for-byte what it is today.
- **Bar in the export:** what the live bar shows in a browser tab, minus record, close, copy link and comments. It opens at As drawn, scaled down to fit a smaller window, like the live player. "Window" is the viewer's own browser window.
- **Touch devices:** when the viewer's primary input is touch, the export draws no bar and no grips and the frame fills the viewport. This is the export host's rule only; the live player at narrow widths keeps its bar.
- **External links** in an exported frame open in a new tab.
- **Export request:** the daemon's HTML export takes a player flag. Absent means without player, so existing callers are unchanged. The dialog sends it and remembers the choice the way it remembers its others.

Turned down:
- Always wrapping exports in the player: the bare file is what you host or embed.
- A redesigned player for exports: it must be the same code.
- Showing the window only after paint (today's behaviour): this is the delay being fixed.
- A pool of several spare windows: one covers the case; memory matters.

## Testing Decisions

- Test what a person or caller sees, at the cheapest level that shows it.
- Mac app: the spare's decisions (adopt, refill, discard when the origin or daemon changed, fall back) as plain functions beside the existing play-window bounds tests. Start-up latency itself is not asserted in CI; it is measured by hand on the m1 with the marks and reported.
- Daemon and runtime: extend the existing play-serve and player parity tests for warming on intent and for a reveal that waits on no extra fetch.
- Shell hosts: the existing player parity suite must pass unchanged after the split; that is the proof the refactor moved nothing.
- Export: extend the existing export browser test (file on disk, network off): with the player, picking a preset changes the frame's own viewport width; with a touch primary input there is no bar; without the player the output is unchanged.

## Out of Scope

- Recording, comments and copy link in exports.
- A CLI verb for HTML export.
- Making exports fully offline for frames that import packages from the web (today's caveat stays, with its warning).
- Spool's overall memory and power footprint. Liam wants that as its own piece of work later. This spec only keeps its own cost small and reports it.
- Changing how the live player looks or moves.

## Further Notes

- Liam approved the look on the canvas (task 609). The frames are in `design/frames/app/` marked To build; ticket 4 names them.
- Memory: the spare was estimated at about 100 MB, which Liam accepted. Measure the real figure and report it.
- From the scouts: the play route, shell assembly and vendor bundles are in the daemon's app, play, player-compile and vendor modules; the shell, chrome, sizing and fit in the runtime's player-shell-runtime, player-chrome, player-size, player-size-model and player-fit; the play window in the desktop main process; the export in the daemon's html-export and the canvas's export menu. ADR 0003 explains why the player is one composed document.
