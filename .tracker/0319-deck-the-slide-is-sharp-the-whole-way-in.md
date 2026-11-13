# #319 · Deck: the slide is sharp the whole way into the presenter view, not only once it lands

- State: closed (merged 2527486a)
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-12T14:15:41.652Z
- Updated: 2026-11-12T22:09:37.341Z
- Closed: 2026-11-12T22:09:36.497Z

## Where this comes from

spool#316 (merged, main `324b16ce`; read its ticket, its comments and `~/.brain-archive/present-blurry/README.md` on devobee first) fixed a talk opening on a blurry slide for seconds: the stage now compiles only the talk and is drawn at +186 ms from the press, cold, on the m1. What is left shows in its own sheet, `~/.brain-archive/present-blurry/after-presenter-cold.png`: in the presenter view (the caret's Presenter view on one display, and always with two) the slide is still the canvas's cover stretched (800 px wide, drawn into a box of 974 CSS px at 2x) from about +600 to +800 ms, near full size and moving slowly as the spring settles, and turns sharp only when it lands. That reads as "blurry, then it focuses". Liam's bar: no artifacts, "as good as if apple would've made them almost"; his report was "you see this blurry slide and it loads slowly".

Presenting full screen on one display already has 0 soft frames (`src/ui/deck/present-slides.tsx`).

## Decided (task 557)

No bigger covers and no shot taken at present time. Make the presenter view's flight do what full screen does: hand over to the live slide as soon as the stage has drawn, mid-flight, while the slide is still small and moving fast, where the swap cannot be seen. The live slide is laid out at its final size and scaled down by the flight's transform, so it is sharp the whole way in and needs no redraw at landing. The picture only covers the time before the stage has drawn.

Rules that stand:
- #307: no double text, no dimming, the slide shown once and at rest (its entrance does not replay over the picture).
- #305: nothing stalls the flight. Measure frame times through the handover, cold with GPU caches emptied as #305 did. If drawing the live slide mid-flight costs frames, bring what and how much to task 557 before choosing.
- #298: the flight's look and timing do not change.
- On a machine so slow that the stage draws after the landing, the cover may stand until it draws: accepted, leave it.

Also answer, with frames: does the room's window (the audience) ever show a soft or empty frame? #316 says the room is live at +364 ms; #306 and #308 hold its window hidden or clear until its slide is drawn. Say what the audience's display shows from the press until then, on one display and on a second (virtual) display, and fix it if anything soft shows.

## Done when

- On the m1 in the Mac app built from your branch, cold and warm, in the presenter view: measured as #316's sheet did (edge contrast of the headline), the slide reaches its at-rest sharpness by the time it is half its final size and never drops after; no frame over one display interval through the handover; the sheet redone beside #316's, in `~/.brain-archive/present-blurry/`.
- A browser test where one can see the rule (once the stage has drawn, what flies is the live slide, not the picture).
- `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset (a patch); merged to main with CI green, not released (nothing is being released; main reaches Spool Beta by itself).
- A message to task 557 with the numbers and the sheet's path, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. The m1 is shared: your own lane and port, quit only what you started. Close the task yourself when done.

## Comments

### agent, 2026-11-12T15:11:29.462Z

Decision from task 557 after task 642's measurements (a live cross-process iframe is re-rastered at every scale of the flight, so it flies at about 0.8 of at-rest sharpness and misses 3 to 4 frames; it cannot fly sharp):

From task 557 on spool#319: choice 3. Do not ship the live slide mid-flight, and thank you for testing the premise instead of forcing it; I was wrong that a live iframe can fly sharp.

Why not 1: the flight must cost the same whatever is on the slide. Your test slide is text; a live slide re-rastered every frame gets worse with a heavy slide (a big DOM, a canvas, 3D), and it already misses 3 to 4 frames and stalled once. Liam's words are "never laggy" and no glitches. A picture flies at a fixed cost. So the flight stays a picture, in every case, and the picture gets right: sharp, and of the beat the talk opens on.

New direction for this ticket (I have added it to #319 as a comment):
1. **Deck slides get a cover at the talk's own size, of the first beat, made ahead by the photo booth** (`src/daemon/booth.ts`, `src/daemon/thumbs.ts`), whenever it makes the slide's ordinary cover. Only for frames that are slides of a deck page. A slide without beats needs only the bigger size. Pick format and quality so a 1920 by 1080 slide is small on disk and decodes fast; report bytes per slide and the booth's extra time, and it must not slow the covers people wait for. Task 638 (spool#318) is changing the booth right now (it steps a slide's beats to time them, and queues timings behind covers): read its branch, build on main once it merges, and ask it by message_task if you need its queue to carry your shot; do not fork the booth.
2. **Present flies that picture** in the presenter view, and in full screen too: decoded ahead (when the stage is readied, a slide is selected, or at the press at the latest, never mid-flight), handed over to the live slide at landing as #307 has it, which is now invisible because the picture is sharp and on the same beat. So the multi-beat answer is: yes, stop the last-beat cover turning into beat 0 at the landing, by flying the first-beat picture; the card changing to the first beat at lift-off, small and fast, is accepted (full screen already does that).
3. **Full screen with a multi-beat slide** today waits on its card until the stage has drawn and then flies live. Measure it the same way (sharpness while flying, missed frames, the wait before take-off). If it shows the same raster lag, give it the picture flight too, so there is one flight for every case and no waiting on the card.
4. **No big picture yet** (a slide just written, the booth not done): fall back to what main does today. Say how often that can happen and for how long after an edit.
5. Keep what you learned: the browser test where it still applies, the blank-frame finding, and a comment on #319 with the Chromium reason a live iframe cannot fly sharp, so nobody tries it again.

Done when, on the m1 cold and warm, presenter view and full screen, single-beat and multi-beat: the headline's edge measure is at the at-rest value from half size to landing and through the handover (say what you reach for full screen at 2x, where a talk-size picture is still upscaled, and whether a 2x picture is worth its bytes); missed frames in the flight no worse than main's 0 to 2; no content change at landing; the room's window answer you are already measuring. The rest of the ticket's Done when stands.

### agent, 2026-11-12T16:43:53.014Z

Why a live slide cannot fly sharp (task 642, measured on the m1, so nobody tries it again).

**What was tried.** The presenter view's flight handed over to the live slide as soon as the stage had drawn it, mid-flight. The slide was laid out at its final size and scaled down by the flight's transform, as full screen's flyer does.

**What it gave**, cold, five runs each, headline edge contrast as a share of at rest:
- main's 800 px cover stretched: 0.41 to 0.47 from about 0.85 of its size until it lands.
- the live slide: 0.67 to 0.90 while it flies (about 0.8 typically), 0.95 within about 30 ms of landing, 1.00 by +820 to +865 ms.
- frames: 3 to 4 missed per flight (13 to 25 ms, once 53 ms), against main's 0 to 2; one run stalled 420 ms near landing, and one showed a single blank frame (the stage's ground, no slide) at the handover.

**Why.** The stage is a cross-process iframe (sandboxed, so an OOPIF). Chromium rasters an OOPIF at the scale it is drawn at: `RemoteFrameView::UpdateCompositingScaleFactor` takes the scale from the accumulated transform (clamped to 0.25 to 5) and, when it changes, sends new visual properties to the iframe's renderer (`RemoteFrame::SynchronizeVisualProperties`, a new `LocalSurfaceId`), which re-rasters at the new scale and submits a new surface. That is a round trip to another process, asynchronous, every frame the scale changes. The embedder draws whatever surface the child last finished, from a smaller scale, stretched, so a growing live slide always lags behind its own size. `will-change: transform` does not help (tested: no change; cc's `PictureLayerImpl` raster-scale rules apply to the embedder's own layers, not to the child's surface). A heavier slide (a big DOM, a canvas, 3D) re-rasters slower and lags more.

**So** a slide in flight is a picture: a picture flies at the same cost whatever is on the slide. The direction now (comment above): the booth's opening still, at talk size and on the first beat, flies, and the live slide takes over at landing.

### agent, 2026-11-12T19:34:25.888Z

New rule for spool builders, in force now (AGENTS.md on main, 0fcbedcc; from devops task 654, confirmed by task 557): do NOT run the full `pnpm test` on devobee any more. It takes about 4 minutes in CI and up to an hour here, and it is most of what overloads the machine. Locally run only `pnpm test:changed` (plus any suite it misses with `pnpm vitest run <path>`), `pnpm typecheck` and `pnpm check`. For the full suite: push your branch, then `gh workflow run ci.yml -R liamvinberg/spool --ref <branch> -f darwin=false` (opening a PR starts the same run), find it with `gh run list -R liamvinberg/spool --workflow ci.yml --branch <branch> --limit 1`, wait with `timeout 900 gh run watch <id> -R liamvinberg/spool --exit-status`, and merge only on green. Leave darwin on only if you changed macOS-specific code (desktop/). If CI fails, reproduce the failing file alone, never the whole suite. If a full local run is going right now, stop it and use CI. This replaces the ticket's line about the full `pnpm test`.

### agent, 2026-11-12T20:41:54.862Z

From task 557 on #319: go for both.

1. Tail: accept about 0.9 in the last 5%, 1.0 from the handover, and keep #298's ease as it is (its look is Liam's). One cheap thing to try, keep only if it measures better and nothing pops: hand over to the live slide as soon as every edge of the flying box is within half a device pixel of where it lands, rather than when the animation ends, so the last soft frames are the live slide. If it shows any shift, drop it.

2. Width: 2x the talk, fitted in 3840x2160. Skip exact-screen-size plumbing. Conditions: (a) only the picture being flown is held decoded, and it is let go after the handover (a 4K picture is about 33 MB decoded; a 30-slide talk must not hold 30 of them); (b) say whether these openings stay on the machine (`design/.spool/`) or travel to the team through spool.page: they must stay local, a talk of 30 slides is 4 to 6 MB of them; (c) when the opening is missing or older than the slide, fall back to main's behaviour, as the ticket says.

3. The cold full-screen stall at take-off (40 to 70 ms): it has to end no worse than main's cover flight (26 to 40 ms) before this merges, or come with the reason it cannot. If your fix does not get there, say what does the stalling.

Testing rule since you started (AGENTS.md on main): no full `pnpm test` on devobee; push the branch and run CI with `gh workflow run ci.yml -R liamvinberg/spool --ref <branch> -f darwin=false`, merge on green.

In the report: the sharpness table as you sent it (main, then the branch, presenter view and full screen), missed frames in the flight, bytes per slide, and the recordings' path.

### agent, 2026-11-12T22:09:36.497Z

Merged to main (2527486a), judged in task 557 from the sheets in ~/.brain-archive/present-blurry/. Open question carried to #320: on two displays the room's slide is drawn at +1.1 to 1.2 s here, against +364 ms measured in #316.

### agent, 2026-11-12T22:09:37.341Z

Merged to main (2527486a), CI green. The numbers and sheets went to task 557 and are in ~/.brain-archive/present-blurry/README.md (spool#319 section).

- Each deck slide gets an opening still from the photo booth: fitted to 3840x2160, JPEG q82, 74-210 KB, kept on the machine only.
- It is decoded ahead and flown in the presenter view and in full screen; the live slide takes over at landing.
- Presenter view edge from half size: main 0.41-0.47, now 0.85-0.95, then 1.0 live after the handover.
- The full screen take-off stall is no worse than main's (interleaved runs): title 15-21 ms vs main 17-189, you-play 20-53 vs 55-243.
- One decoded still is held at a time. An edit drops the still, and the slide flies its cover until the booth retakes it.
- Not measured: full screen warm, and the slow-machine case.
