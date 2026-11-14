# #343 · A canvas of 5,000 frames: the drawing spikes

- State: closed
- Labels: wayfinder:prototype
- Parent: #333
- Blocked by: #334, #337
- Tasks: task 676 (Canvas drawing spike for spool-next)
- Created: 2026-11-13T14:47:11.073Z
- Updated: 2026-11-13T20:22:42.047Z
- Closed: 2026-11-13T20:22:42.047Z

## Question

Which way of drawing the canvas meets the budget, with room to spare?

This is a spike: throwaway code that exists to be measured and looked at. Its answer is a table, recordings and pages Liam can open, which the ticket after it (#344, "How the canvas is drawn, and how a picture becomes live") decides from with him. You do not decide the design, and you do not argue for or against the rebuild: Liam has decided to rebuild spool from the ground up as **spool-next** and wants each foundation question answered by evidence. His words: "i just want things to feel snappy fast, where we probably ofcourse utilize webgl or the most performant libraries and capabilities, and ofcourse do smart things like image replacement that looks identical and when zooming in it goes live".

## What spool is, in a few lines

Spool is "a canvas for creative work in the age of agents" (Liam). An agent writes *frames* (today each is a small TSX file, a React document compiled with esbuild and run in an iframe on a separate origin, because nothing an agent wrote may run with spool's own power). Frames stand on a zoomable canvas, hundreds to thousands on a page. Far out, each frame is shown as a picture of itself; zoomed in to reading size, the frame is live and can be clicked and typed in. People pan and zoom constantly, so this is where spool is felt as fast or slow.

Today's spool is the repo `liamvinberg/spool`, on devobee at `/home/liam/agent-hub/projects/spool` (read-only for you). Its canvas: every frame's picture is drawn by one WebGL2 canvas behind the DOM, and live documents are iframes over it (`src/ui/canvas/picture-layer.ts`, `picture-gl.ts`, `picture-plan.ts`, `docs/adr/0010-the-daemon-makes-every-still-and-the-gpu-draws-them.md`). Never stop or use its daemons (ports 7766, 7767, 7788, 7790 and 7791 are other people's).

## Read first

- `~/.brain-archive/spool-foundation/research/fast-canvases.md`: the research this spike follows from. Its last part describes the four designs below, each with a likely gain, a cost and a test that can fail. Follow those tests.
- `~/.brain-archive/spool-foundation/research/engine-and-shell.md`: what Electron, CEF and WKWebView can and cannot hand to a GPU scene.
- `~/.brain-archive/spool-foundation/measured-today.md` and the folder beside it: a first measurement of today's spool (on devobee, headless and under load, so a weak baseline) with scripts you can reuse: `prepare.py` builds a 5,000-frame page from ten real frames. A better baseline from the m1 may land there while you work.
- The budget and principles on ticket spool#334.

## The budget (spool#334)

On Liam's m1 (MacBook Pro M1 Pro, 32 GiB, 120 Hz), which is the floor:
- a page of about **1,000 frames** pans and zooms at **120 frames a second**: this is the target case (his largest project has 856 frames, its largest page 228);
- **5,000 frames** stays usable, never under 60: a guard, not something to trade the target case for;
- a project opens to a usable picture in under a second;
- a frame going from picture to live looks **identical** at the moment of the swap, and the swap is not felt;
- a still canvas uses no CPU to speak of.

## The content

The same frames for every design, so only the drawing differs. Build once, as static files, from the ten real frames `prepare.py` uses (spool's own `app/` frames): for each, the compiled live document (HTML plus its bundle, as today's spool would serve it) and pictures of it at the sizes a design needs. Serve them from a static server of your own on **two origins** (the canvas page on one port, frame documents on another), because frames on another origin is today's safety line and several designs stand or fall on it. Then lay out pages of 1,000 and 5,000 frames by cycling the ten. Getting the compiled documents out of today's spool is yours to solve the cheap way (its build, its export, or a daemon of your own on a lane: `SPOOL_DIR=/tmp/spike-343/state SPOOL_PORT=<free port> pnpm -s dev ...` in a checkout or worktree of your own, stopped when done).

## The designs

Each as the smallest page that can pan and zoom the two test pages with pictures far out and live frames at reading size (a handful live at once: whatever is at reading size in the viewport, bounded).

1. **GPU pictures plus a bounded number of live DOM documents.** Today's design, done again cleanly: one WebGL2 (or WebGPU) canvas draws every picture in one instanced draw; live frames are iframes over it. This is the line to beat, so do it well.
2. **DOM only, culled hard** (tldraw's way): pictures as images, live frames as iframes, everything off screen hidden or unmounted, the browser's own compositor does the rest. The cheap baseline.
3. **HTML-in-Canvas** (stable in Chrome 157): the browser lays out each live frame, and one WebGL or WebGPU scene draws pictures and live frames alike, so a picture and its live frame are the same pixels in the same scene. Prove first, before building further, since the design falls with them: can a frame on **another origin** be drawn this way (cross-origin pixels are restricted; try a sandboxed iframe, an opted-in one, and whatever the spec's current answer is), does it stay interactive (click, type, select text, scroll inside), and which Electron carries Chrome 157 or later (today's Mac app is on Electron 43.8.4). If another origin cannot be drawn, say what the weakest isolation is that can, in plain words: #344 has to weigh that against the safety line.
4. **A native GPU compositor that takes browser surfaces as textures** (the Rust or GPUI shape). The most expensive, so **capped at about three hours**: a feasibility probe, not a canvas. Through Electron's offscreen rendering with shared textures, or CEF: get one live frame's surface into a GPU scene of your own, pan and zoom it with a few hundred pictures, send it a click. Report how far it got, the frame times if it got that far, and everything that was hard (input, focus, text entry, sharpness at zoom, texture lifetime). If it does not run in three hours, where it stopped is the finding.

If you see a fifth design worth an hour while building these, note it; do not build it without asking task 634.

## What to measure, per design, on both pages

1. **Panning and zooming:** frame times over a scripted pan and a scripted zoom, far out (the whole page visible) and at reading size: median, 95th and 99th percentile, worst, the share of frames over 8.3 ms and over 16.7 ms. Use real presentation timing where you can (Chrome tracing), not only requestAnimationFrame intervals, and say which each number is.
2. **Opening:** time to the first picture and to every visible picture being sharp.
3. **Picture to live, and back:** how long it takes, and whether it shows. Capture the frame before and the frame after the swap and compare them pixel by pixel; report the difference as a number and as two images. "Identical" is the bar.
4. **Motion:** lift one live frame out of its place to the centre of the window at real size while the rest dims (the rethink's way of playing a frame, called "forward"), and put it back, animated. Does it hold 120 frames a second, and does the frame stay live and sharp throughout?
5. **Drawing over a live frame:** a selection outline, a comment pin and a cursor of another person over a live frame, moving with it during a pan. Today a GPU layer under the DOM cannot draw over an iframe; say what each design can do, and whether the overlay stays glued or lags.
6. **Idle and memory:** CPU over 30 still seconds, memory of the page's processes, GPU memory if you can read it.
7. **What each made hard:** a paragraph per design, including what an extension that wants to draw on the canvas would be given to draw with.

## Where and how to measure

On the m1 (`ssh m1`; read the m1 skill first), in a **headed** Chrome on its 120 Hz screen: headless numbers do not show 120 Hz. Use a Chrome for Testing of version 157 or later that you install in your own folder, `~/scratch/spool-next-spikes/canvas-drawing/`; check `~/scratch/spool-next-spikes/` first, since task 675 (the frame format spike) may have left a Chromium there. The m1 is shared and busy:
- the screen is taken through its slot tool (`~/.agent-hub/m1/slot run screen --task <your task number> --wait 30m --max 60m -- ~/.agent-hub/m1/gui ...`, as the m1 skill says); other tasks hold it for hours at a time, so **build and debug everything on devobee first** and take the slot only for short, scripted measuring runs;
- also take the lock `mkdir ~/scratch/spool-next-measure.lock` on the m1 around each measuring run (wait and retry if it exists; remove it after, and always on exit), so two spikes do not measure at once;
- repeat each measurement at least five times, report median and worst, and record the load average with every run;
- touch neither the Spool nor the Spool Beta app there.
Measure today's design the same way as the others: design 1 is that. If today's real spool gets a baseline on the m1 while you work (in `measured-today.md`), put it in your table as a fifth row.

## What done looks like

- `RESULTS.md` in the spike's folder, and a copy at `~/.brain-archive/spool-foundation/spikes/canvas-drawing.md`: the tables, the paragraph per design, the swap images, the exact commands so it can be run again, what was not measured and why. Plain language. No recommendation on which design spool should choose: end with "what the numbers say" in five or six lines and the questions they leave open.
- Each design openable on devobee from one index page (a command and a URL), so Liam can pan and zoom each himself; and a short screen recording of each from the m1 (pan, zoom, the swap, the lift).
- For design 3, a clear yes or no on frames on another origin, with the evidence.

## Where it lives

Project **spool-next** (agent-hub). Put the spike in `spikes/canvas-drawing/`. The project may have no repo when you start: task 675 is expected to give it one (`spikes/frame-formats/` and a root README). Work in your own task folder meanwhile. When you have results to keep, look with `list_projects`: if the project has its repo by then, add a worktree from its main checkout on a branch named after your task, copy your spike in, commit, bring the branch up to date with main, merge it to main and push; only if the project still has no repo and task 675 is closed, call `give_project_repo` yourself and add a root `README.md` of a few lines (the repo is spool-next, decided on the map spool#333, nothing under `spikes/` is ever imported by product code). Do not set up the product's structure, tooling or CI. Commits atomic, lowercase, terse, no body.

## Rules

- Claim this ticket first: `update_ticket({ ticket: "spool#343", claim: true })`.
- Put a time limit on every command that could wait for input or hang (`timeout`).
- You may hand parts to workers (one design each is a natural split); keep the content build and the measuring harness yours so every design is measured the same way.
- Before any choice this page does not settle and that would change what is measured, message task 634 (`message_task`) and go on with your best guess meanwhile. Task 634 may be slow to answer.
- When done: comment the results' summary on spool#343 (do not close it, task 634 judges it first), message task 634 with a few lines and where everything is, then close your own task.
- Clean up: remove your lock, stop your servers and daemons, and say what you left on the m1.

## Comments

### agent, 2026-11-13T16:33:28.749Z

Unblocked from #335 by task 634 on 2026-11-13: the first measurement of today's spool could only run on devobee (the m1's screen was held until 19:44), and this spike measures today's design itself as design 1, so it does not need to wait. The m1 baseline joins its table when it lands.

### agent, 2026-11-13T20:21:53.822Z

Done by task 676. The results are in spool-next's `spikes/canvas-drawing/RESULTS.md` (main, b76e76e), with a copy at `~/.brain-archive/spool-foundation/spikes/canvas-drawing.md`. It makes no recommendation.

Measured on the m1 in Chrome 157, headed, five runs per design and page. The numbers below are presented frames a second (Chrome trace, merged per refresh), median run. The m1 was under load (median load average 3.3 to 3.7, peaks over 20, the out-of-memory dialog up), so the control page itself presents only 114 to 115.

- **1. GPU pictures + live iframes:** whole page 90 (1,000) and 91 (5,000), reading size 90 and 88. The swap at the reading stop is identical at 1,000; at 5,000, 0.2% of pixels change visibly, in one frame cut by the screen edge. Going live takes about 1.2 s.
- **2. DOM only:** reading size 83 to 85, whole page 20 at 1,000 and nothing presented at 5,000. Paint containment (`contain: strict`) explains part of it; 2b without it gives 66 and 3.
- **3. HTML-in-Canvas:** about 89 to 106, and the swap is identical on both pages. **Other origins: no.** It draws only frames that run as the canvas page (same origin, no sandbox or `allow-same-origin`). Proof in `designs/3-html-in-canvas/proof`; stable in Electron 46 (Jan 2027).
- **4. Native compositor (Electron shared textures):** works end to end on the m1 (pan, zoom, click, typing). The scene's median frame is 8.3 ms. Input, focus, IME and sharpness are ours to build. See `designs/4-native/NOTES.md`.
- **5. One document, format E (task 634's addition):**
  - 5a, every frame mounted: 120 at reading size, 12 whole page at 1,000, and no presented frame at 5,000. Opening becomes mounting every frame plus the first paint: 0.6 s whole page at 1,000, 3.9 s at 5,000.
  - 5b, over GPU pictures: pans like design 1 and goes live in 16 to 46 ms.
  - Its frames are a sixteenth of spool's DOM.

Still CPU is 0.3 to 1.5% in designs 1, 2, 3 and 5b. Raw traces and .mov files are in devobee's `~/scratch/spool-next-spikes/canvas-drawing-raw/`.

### agent, 2026-11-13T20:22:42.047Z

**Judged by task 634, 2026-11-13: it is the thing asked for, and thorough.** Results: `spikes/canvas-drawing/RESULTS.md` in liamvinberg/spool-next (copy at `~/.brain-archive/spool-foundation/spikes/canvas-drawing.md`); every design openable at http://devobee.tail9e5223.ts.net:34361/index.html while the server runs (design 3 needs Chrome 157 or later); recordings in `results/m1-final/recordings/` and `results/m1-e/recordings/`.

What it settles for #344 (all on the m1, headed, 120 Hz, under load; a page that draws nothing presented 114 to 115 a second, so that is the ceiling here):
- **Pictures drawn by the GPU far out are not optional.** Every design that leaves the whole page to the browser fails there: plain images 20 a second at 1,000 frames and nothing at 5,000; every frame live in one document 12 a second at 1,000 and nothing at 5,000, even with frames a sixteenth as heavy as spool's.
- **Design 1 (GPU pictures, live frames over them) holds on both pages:** 88 to 117 presented a second, never under 60, 5,000 no slower than 1,000. Opening shows the first picture in 59 to 132 ms.
- **HTML-in-Canvas (design 3) is as fast and its swap is identical everywhere, but it cannot draw a frame from another origin** (nine variants tried, all blank; the opt-in in WICG/html-in-canvas#131 is not in Chrome 157). So it cannot keep the line between agent-written code and spool. It also needs Electron 46 (January 2027).
- **A native compositor (design 4) works end to end** (a live frame as a GPU texture, panned, clicked, typed in) and gave no better frame times, while input, focus, text entry (no IME), popups and sharpness all become ours. Nothing in the numbers asks for it.
- **Frames that run no agent code change going live, not panning:** in one document over design 1's pictures (5b) they pan like design 1 and go live in 16 to 46 ms, against 0.6 to 1.3 s for an iframe.
- The swap is pixel-identical at the zoom the picture was taken at, and differs by 1 to 3% between those zooms: a known thing to fix (pictures at more zooms, or at the frame's own offset).
- Motion (the lift) and overlays glued to a live frame work in every design.

Left open: what a quiet m1 presents (design 1 presented about 90 on pans against the control's 114, while its own rAF ran at 116); whether today's spool is where design 1 is (#335, m1 rerun in progress); whether format E's interpreter is a boundary to trust; heavier format E frames.
