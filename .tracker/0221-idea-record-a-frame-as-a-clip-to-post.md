# #221 · Idea: record a frame as a clip to post

- State: closed (shipped)
- Labels: ready-for-human
- Created: 2026-11-05T17:52:29.116Z
- Updated: 2026-11-05T21:28:47.704Z
- Closed: 2026-11-05T21:28:47.704Z

Record a frame playing, its motion and interactions, as an MP4 you can post on X. Under an experiment (`experiments` in ~/.spool/config.json) until it earns its place. Grill it first (the grilling skill), then prototype before building. From task 433.

## Why

Liam's lab (`sandbox/lab`, team project devosurf/lab) makes micro interactions to post. Today every clip means a screen recorder, cropping and trimming by hand.

## Prior art

- Shawn's (@zzzzshawn) prototyping studio has **Record** beside Riff, Reiterate and Keep on every direction.
- Kit Langton's `opencode-bloom` and `psychopomp`: video from code, every frame a pure function of time.
- ADR-0010: the daemon already makes every still headlessly.

## For the grilling

1. Who drives the frame during recording: the person's real pointer on the canvas, a replay of a recorded session, or a scripted loop the agent writes (a `--post` variant)?
2. Real time capture (screencast) or deterministic frame-by-frame rendering (pause the clock, step it, encode)? The second gives a perfect 60 fps and a seamless loop, but needs a frame's time to be controllable.
3. Where it lives: a canvas verb on a selected frame, a CLI verb (`spool record <frame>`) for agents, or both.
4. Framing: the frame's own size, or a post size (16:9, 1:1) with the frame centred on a plain background; a visible cursor or not.
5. Sound: frames can play sound (cuelume); is it captured?
6. Output: where the file goes (never in design/: over 25 MB stays local), size targets for X.

## Decided (grilled 2026-11-05, task 434)

- **Driver:** the person's own pointer. Spool records the moves (position, presses, drags, timings) while they play, then the booth replays them into a fresh copy and renders frame by frame at 60 fps. Not a screen capture. Random values are not seeded yet: a frame using Math.random may play back a little differently (the experiment's tradeoff says so).
- **Agents:** `spool record <frame>` (`--out`, `--seconds`) records a frame that plays itself (a lab `--post` variant). No pointer scripting in the CLI.
- **Where:** **Record** in a frame's right-click menu (opens the player already recording) and a Record button in the player's edge bar. The player is the one recording surface. A red dot and timer while recording; the same button or Esc stops.
- **Walks:** the clip follows walks to other frames, one continuous video.
- **Framing:** 16:9 by default, 1:1 or the frame's own size, frame centred on its own background colour.
- **Cursor:** a drawn macOS arrow at 1.5x, no press rings: the clip shows only what the frame does.
- **Sound:** the frame's own (cuelume, `<audio>`, WebAudio), caught on virtual time through an OfflineAudioContext shim and muxed as AAC-LC, the codec X takes.
- **Trim:** automatic, from 0.3 s before the first move to 0.5 s after the last.
- **Length:** capped at 60 s, the timer reddens from 50 s.
- **Output:** H.264 MP4 at 60 fps, under 20 MB, downloaded (canvas) or written to `./<frame>.mp4` (CLI). Never in design/.
- **Experiment:** an entry `record` in `src/settings/experiments.ts`, stage experimental, off by default.
- **Later, its own ticket:** a CleanShot-style studio to re-render the kept recording with other background, padding, cursor, aspect, trim.
- **Testing:** a lane daemon on devobee reached from the Mac over `ssh -L`.

## Prototype questions

1. Can the booth's headless-shell replay recorded moves frame by frame (virtual time, beginFrame) with motion, CSS transitions and :hover intact?
2. Can it produce H.264 MP4 with nothing new installed (Playwright's ffmpeg is VP8 only)?

## Prototype results (spikes/record, task 434)

1. **Yes.** The pinned headless-shell (1228) with `--deterministic-mode`, virtual time and `beginFrame` replays recorded pointer moves into a page: :hover and :active styles, CSS transitions, keyframe animations, rAF springs and click handlers all render correctly. 4.2 s at 1280x720 rendered in 4.4 s on devobee (PNG screenshots). Gotchas: load the page in real time and pause the clock after load (virtual time from the start never fires load); the BeginFrame clock must be CLOCK_MONOTONIC ms and never go backwards, or rAF time is stuck at 0 and transitions freeze; Chromium needs `--no-sandbox` as Playwright passes it.
2. **Yes.** WebCodecs `VideoEncoder` in the same shell encodes H.264 High (`avc1.640028`) in software, only in a secure context (the daemon's 127.0.0.1 origin is one). 252 frames became 770 KB in 2.2 s. Muxing to MP4 needs a small JS muxer (mediabunny). No ffmpeg needed.

## Built (task 434, branch 434-spool-221)

- `src/runtime/record-hands.ts` notes the hands in the player's frame document; `src/runtime/player-recorder.ts` is the bar's state (record, stop, pick a shape, render, download).
- `src/daemon/record.ts` replays them into a fresh recording document in the deterministic shell and encodes H.264 in a second tab on a routed secure origin; sound is AAC through `@mediabunny/aac-encoder` (MPL-2.0, bundled, license in dist/licenses.md). `POST /api/p/:project/record` serves it, one render at a time, 403 while the experiment is off.
- Render speed: JPEG shots (q95) instead of PNG, pictures pushed to the encoder over their own CDP session while the next is drawn, and the clip split into parts rendered side by side in separate browsers (`clipParts`, up to six, a quarter of the cores), each replaying from the start and keeping only its own stretch. The page loads on virtual time with its clock held at one reading from its time origin, and Math.random is seeded, so every part replays the same and the joins are invisible (two renders agree to under a pixel). On devobee under load: 3.5 s at 1080p went from 56 s to 12 s, a 10 s clip takes about 22 s.
- Sound fixed: an OfflineAudioContext renders from its own start, so "now" calls (`start()`, `.value =`, disconnect) all landed at 0 and a tone droned for seconds. The shim now runs `currentTime` on the page's clock and lands every now-call at the moment it was made, connect and disconnect through a gate. Checked with cuelume 0.2.8.

## Prototypes (canvas, task 434)

- `explore/record-cursor`: today's arrow, the Mac's rounded arrow with the pointing hand and eased motion, spool's teammate arrow squashed by a press, a soft touch.
- `explore/record-flow`: `flow-bar` (as built), `flow-shape` (shape first, the frame played at that shape while it records), `flow-review` (count of three, then the clip to see before saving). States across.
- The surround follows the screen on show, sampled every picture, so a walk to a frame of another colour takes it along.

## Comments

### agent, 2026-11-05T21:27:04.279Z

Liam's picks built (task 434, bb20f77b, 89c3da93):

- Cursor: the Mac arrow, and the pointing hand where the frame's own `cursor: pointer` is. Only the drawn cursor is smoothed (two-sided Gaussian), pinned to the real point around presses, faded out after 1.2 s at rest. `src/daemon/record-cursor.ts`.
- Flow is shape first: the dot opens a panel (16:9, 1:1, frame; Cancel, Start recording). The frame plays at `shapedBox` in the window's dark while the panel is up and while it records, so what is seen is what the clip holds. The bar shows the shape, the time and esc; stopping renders at once with "rendering N%" and a line along the bar's foot (`GET /api/p/:project/record/progress`), then a "Saved <file>" toast. Failed offers try again or discard. The canvas's Record opens the player at the panel (`record=arm`).

### agent, 2026-11-05T21:28:47.704Z

Merged into main (bb20f77b). Ships behind the Record experiment, with the changeset `record-a-clip`.
