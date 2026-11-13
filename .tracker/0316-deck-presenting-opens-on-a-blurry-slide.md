# #316 · Deck: presenting opens on a blurry slide that takes seconds to turn sharp

- State: closed
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-12T11:46:45.919Z
- Updated: 2026-11-12T14:15:46.425Z
- Closed: 2026-11-12T14:14:17.366Z

## What Liam saw

Spool 0.56.0, Mac app, experiment `deck`, presenting with the presenter view (his notes here, the room in a window; the header reads "room · Built-in Retina Display"). Screenshot: `~/.brain-archive/present-blurry/presenter-5s.png` on devobee (view it first). The talk's clock reads 00:05 and the slide in the presenter view is still soft, like a small picture stretched: the headline, the small text and the icons are all blurred, while the notes beside it are crisp. His words: "when opening presentation you see this blurry slide and it loads slowly, i dont konw if this is good ux, or if we should see a loader and not anything until its done, or a skeleton i dont know. or if we should make it more performant".

Also in the screenshot, and possibly the same cause: the notes say "1 of 5 · title", but the pane for what comes next reads "next the end" with "end of the talk" under it, on the first of five slides.

## What is decided (task 557)

No loader and no skeleton. A talk never shows that it is loading: the canvas already has the slide drawn, so there is always something true to show. The rule:

1. **Never soft.** From the frame the slide stops growing, whatever stands for it (a picture or the live slide) is drawn at the screen's full sharpness, on a 2x display too. If a picture stands in, it is made at the size it is shown, not a thumbnail stretched; if the live slide is there but its layer was drawn small and scaled up, it is redrawn at size.
2. **Live fast, and the handover is invisible.** The live slide takes over without a visible change (no shift, no dim, no double text; #307 settled that the picture waits for the slide's entrance, capped at 1 s). Nothing should take 5 s on a slide like this one (text and a few icons).
3. **The next slide is ready before the key.** Stepping never shows a soft or empty slide either: what the next key plays is loaded ahead, within the limits the stage already keeps (at most 2 WebGL contexts).

This holds in every host: the presenter view's own slide and its next pane, the room's window, and full screen on one display.

## What to do

Follow the diagnosing-bugs skill: reproduce before fixing, and find out which it is. Suspects, none confirmed: the slide's picture (the canvas's still) staying up because the live slide in the presenter view is slow or never says it is ready; a layer rasterised small during the flight and never redrawn sharp after; the presenter view's stage waiting for something (fonts, the room, the second stage for the next pane) before it shows; a cold start (first Present after the app opens). Measure on the m1 in the Mac app built from main, in a talk of five slides with real text, web fonts and a few inline SVGs (make one like the screenshot's; the m1's display is 2x): from the press, when each of the presenter's slide, the next pane and the room is (a) shown, (b) sharp, (c) live, cold (app just started, GPU caches emptied as #305 did) and warm, and the same for → to each next slide. Sharpness can be read from screenshots (edge contrast of the headline against a reference shot of the slide at rest).

Then fix it to the rule above, and fix the next pane if it is wrong on slide 1.

## Leave alone

How Present looks and its keys (#298), the flight, the top right row (#312). Task 621 (#309) is finishing a native module in `desktop/`; stay out of what it touches and pull main often. The m1 is shared: your own lane and port, do not quit apps you did not start.

## Done when

- The cause is named with proof (before numbers and a sheet of frames).
- After: on the m1, cold and warm, in the presenter view, the room and full screen: no frame after the flight lands where the slide is soft; the live slide has taken over within 1.2 s cold of the press for a slide like the screenshot's (say what you reach and what the rest is spent on); stepping shows the next slide sharp in the first frame. Sheets in `~/.brain-archive/present-blurry/`.
- A browser test where one can see the rule (the shown slide's picture is never smaller than the box it is drawn in times the device's pixel ratio; the next slide's document is loaded before the key).
- `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset (a patch); merged to main with CI green, not released.
- A message to task 557 with the cause, the numbers and what is left, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-12T14:06:58.991Z

## Measuring what a slide costs (learned on #316)

What worked, on the m1 Mac app over CDP (`--remote-debugging-port`), in a lane of its own:

- **Frame times: a rAF sampler in every window** (presenter, room, full screen), every frame recorded, cold (app relaunched, `GPUCache`, `DawnGraphiteCache`, `DawnWebGPUCache` and `Code Cache` emptied) and warm. At 120 Hz an interval over 12.5 ms is a missed frame. Compare against the same slide alone in a plain window (`/p/<project>/frames/<frame>` opened top level): that is the slide's own cost, so whatever exceeds it is the host's.
- **Where the time goes: a CDP trace with long tasks**, plus timing the daemon's own steps directly. The stage composed the whole project's player: 2463 ms for an 884-frame canvas against 44 ms for the 5 slides of the talk. That was most of the 6 s blur.
- **Sharpness: CDP screencast frames**, and edge contrast in the slide's box (the 99.7th percentile step between neighbouring pixels over the box's brightness spread) against the same slide at rest. It separates a stretched cover from a live slide reliably. It can't measure a slide that is still growing, because the box changes under it.
- **A picture's resolution in the DOM**: each frame, the cover's natural width against its drawn width × devicePixelRatio. Covers are 800 px wide (sharp to 400 CSS px at 2x), so any stand-in drawn bigger than that is soft. This is what the browser tests check (`watchPictures`, `stretched`).
- **Memory over a long run**: RSS of the app's process tree, and per window CDP `Performance.getMetrics` (Documents, JSHeapUsedSize, Nodes), sampled during a 30-slide talk stepped 3 times. Compare the first pass with the last.
- **`spool shot <slide> --beat 1`** took 2.5 to 3.7 s for kit-explainer's title. Too slow to make a stand-in picture on demand; fine as a one-off.

What didn't work: a small 5-slide talk never showed the blur, because the cost scales with the project, not the slide. Reproduce on a big canvas. Load spikes on the m1 (30 to 135) skew everything: check `uptime` first.

Results for this fix: `~/.brain-archive/present-blurry/` on devobee (before/after sheets, fps report).

### agent, 2026-11-12T14:14:17.366Z

Merged to main as 324b16ce, CI green. Left open for Liam (task 557): the presenter flight's last ~100 ms, and a slower machine where the stage draws after landing, still show the stretched cover. Removing that needs a picture made at the size shown.

### agent, 2026-11-12T14:15:46.425Z

Merged to main and judged in task 557. The soft frames left in the presenter view's flight went to #319.
