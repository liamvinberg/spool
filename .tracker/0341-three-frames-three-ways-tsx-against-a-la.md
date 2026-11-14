# #341 · Three frames, three ways: TSX against a language of our own

- State: closed
- Labels: wayfinder:prototype
- Parent: #333
- Blocked by: #338, #334
- Tasks: task 675 (TSX vs custom language spike)
- Created: 2026-11-13T14:47:11.030Z
- Updated: 2026-11-13T18:40:41.635Z
- Closed: 2026-11-13T18:40:41.635Z

## Question

Does a format of our own beat TSX where it counts: how fast it draws, how well an agent writes it, how well a hand can edit it?

This is a spike: throwaway code that exists to be measured and looked at. Its answer is a table and things Liam can open, which the next ticket (#342, "What a frame is") decides from with him. You do not decide the format, and you do not argue for or against the rebuild: Liam has decided to rebuild spool from the ground up as **spool-next**, and wants each foundation question answered by evidence. His words: "Maybe it isnt tsx, maybe we write our own language ive been considering this ... maybe we spike that".

## What spool is, in a few lines

Spool is "a canvas for creative work in the age of agents" (Liam). A person says in words what they want; an agent writes it as a *frame*; frames stand on a zoomable canvas, where the person arranges, plays and compares them, says what they like and don't, and edits by hand at least the text. Kinds of work: app and website prototypes you can click through, slide decks, posters, illustration boards. The people are not only designers: someone making a presentation should be at home in it. Today a frame is a small TSX file (a React document, compiled by spool with esbuild and run in an iframe on a separate origin); a picture of it is shown until you zoom in.

Today's spool is the repo `liamvinberg/spool`, checked out on devobee at `/home/liam/agent-hub/projects/spool` (read-only for you; its `AGENTS.md`, `docs/adr/0002-frames-are-tsx-compiled-by-spool.md` and `0009-hand-edits-write-the-tsx-where-it-is-written.md` say how frames work today). Never stop or use its daemons (ports 7766, 7767, 7788, 7790 and 7791 are other people's).

## Read first

- `~/.brain-archive/spool-foundation/research/frame-formats.md`: the research this spike follows from, with sources. The candidates below come from it.
- `~/.brain-archive/spool-foundation/research/fast-canvases.md`, sections on HTML-in-Canvas and on what draws what: a format and what draws it are separate choices.
- The budget and principles on ticket spool#334.

## The three sample things

Take them from the rethink prototype's made-up brand, Kaffe, in `/home/liam/dev/projects/spool-rethink/design/` (start in `shared/scenarios`, `shared/core` and `frames/app/spool/frame.tsx`; read-only, it is a live team canvas other tasks edit). If a sample there is tangled into the prototype's own canvas code, rebuild it small and standalone from what you see; the look matters less than that the three are real:

1. **An app screen with state and a transition**: something you can click that changes what is shown, and animates (a list to a detail, a cart count, a tab).
2. **A slide**: a title, text, a picture, laid out at a fixed size.
3. **A poster**: free placement, large type, a picture, a shape or two.

## The formats

A. **TSX as today**: the line everything is compared with.
B. **Plain HTML and CSS with a small behaviour layer** (attributes or a few lines of script, no React).
C. **A catalog format**: the agent composes from a fixed catalog of parts with bindings, state and actions. Use OpenUI's language or json-render, whichever you can get running fastest; say which and why.
D. **Rive RML**: XML source with scenes, motion and state machines, drawn by Rive's runtime with no browser layout. If it cannot be authored or run without signing in to Rive's editor, or within about an hour of effort, record exactly where it stopped: that is a finding, not a failure.
E. **A sketch of a language of our own.** This is the one Liam asked for, so give it real thought, but keep it a sketch: a written grammar by example (a page or two), the three samples written in it, and the smallest interpreter that draws them (drawing to the DOM is fine; note what else could draw it). Shape it from what A to D teach and aim it at what a new language could give that TSX cannot:
   - every visible thing is an explicit object with a stable name, so a hand can move it or retype its text and the change is written back as a one-line edit;
   - state and transitions are declared, not coded, so spool can know every state a frame has without running it (for playing, for pictures of each state, for flows between frames);
   - it could be drawn without a browser one day, or by one today;
   - short for an agent to write and to change, and it diffs and merges line by line;
   - it does not shut out real code where a prototype needs it: say how a frame would escape to code, or that it cannot.
   Name nothing for the product: call it "format E". Its name and look are Liam's, later.

## What to measure and try

**1. Speed**, on Liam's m1 (`ssh m1`; read the m1 skill first; it is a MacBook Pro M1 Pro, 32 GiB, 120 Hz). For each format and sample: time from source to first picture, time to interactive, and the cost of a hundred copies standing on one page (frame times while the page is panned by a scripted transform, memory). Use a Chromium you install in your own folder; say headed or headless. The m1 is shared and busy: work only in `~/scratch/spool-next-spikes/`, use your own ports, repeat each run at least five times, report median and worst, and record the load average with every run. A worker of task 634 may be measuring today's spool there at the same time: before a measuring run, take the lock `mkdir ~/scratch/spool-next-measure.lock` (wait and retry if it exists; remove it after your run, and always on exit), so two measurements do not disturb each other. If the m1 cannot be made to work within about 40 minutes, measure on devobee and say so plainly.

The budget they are judged by (spool#334): a canvas of about 1,000 frames pans and zooms at 120 frames a second; an agent's edit shows in under 0.3 seconds from the file being written; opening shows a usable picture in under a second. A hundred copies is this spike's stand-in; the canvas spike (#343) does thousands.

**2. How well agents write it.** For each format, with fresh workers that have never seen it (the `worker` tool; a new worker per try so no context carries over): give the same short teaching page (the kind of page spool's skill would hold: at most 150 lines per format, written by you, equal care for each), then the same words for each sample ("make ..."), then the same change request ("now ..."). Three tries per format per sample, on two models: Claude (`anthropic/claude-opus-5-5`) and Codex (`agent: "codex"`). Count: ran first try, looked right (you judge from a screenshot against the words, with the same checklist for every format, written before you look), the change landed without breaking the rest, how many tokens the output took, how long it took. Keep every output and screenshot. Say honestly where your teaching page may have favoured a format. That is 5 formats, 3 samples, 3 tries, 2 models: keep each worker's brief small, run them in batches, and if the count must be cut for cost, cut tries to two before cutting anything else, and say so.

**3. Editing by hand.** For each format, try the two edits Liam cares about: retype a word that is on screen, and move one thing. Build only as much as shows whether the edit can be written back to the source as a small, correct change, and try it on the hard cases too: text that is computed or comes from a list, a thing placed by a layout rather than by coordinates. Report what was written back, as a diff, per format.

**4. What each gives up.** One honest paragraph per format: interaction and state it cannot express, how it would import from Figma, how two edits to one frame merge, what it needs to be drawn, what an agent or a person would miss.

## What done looks like

- A page `RESULTS.md` in the spike's folder, and a copy at `~/.brain-archive/spool-foundation/spikes/frame-formats.md`: the tables (speed; agent writing; hand editing), the paragraph per format, the exact commands so it can be run again, what was not measured and why. Plain language, no recommendation on which format spool should choose: end instead with "what the numbers say" in five or six lines, and the questions they leave open.
- The fifteen things themselves (three samples in five formats, less any that proved impossible) openable from one local page on devobee, side by side per sample, so Liam can look and click. Say how to open it (a command and a URL), and attach screenshots of each to your report.
- The grammar-by-example page for format E.

## Where it lives

Project **spool-next** (agent-hub), which has no repo yet: give it one with `give_project_repo` when you first have something worth keeping (a private repo, `spool-next`). Put the spike in `spikes/frame-formats/`, and add a root `README.md` of a few lines saying the repo is spool-next, that it is being decided on the map spool#333, and that nothing under `spikes/` is ever imported by product code. Do not set up the product's structure, tooling or CI: that is decided later (#345, #351). Commits atomic, lowercase, terse, no body.

## Rules

- Claim this ticket first: `update_ticket({ ticket: "spool#341", claim: true })`.
- Put a time limit on every command that could wait for input or hang (`timeout`).
- Before any choice this page does not settle and that would change what is measured, message task 634 (`message_task`) and go on with your best guess meanwhile.
- When done: comment the results' summary on spool#341 (do not close it, task 634 judges it first), message task 634 with a few lines and where everything is, then close your own task.
- Clean up: remove your lock, stop your servers, leave `~/scratch/spool-next-spikes/` on the m1 only if the canvas spike could reuse its Chromium, and say so.

## Comments

### agent, 2026-11-13T18:39:31.337Z

## Results (task 675)

Everything is in the new repo **liamvinberg/spool-next**, at `spikes/frame-formats/`. Start at `RESULTS.md`. The grammar of format E is in `FORMAT-E.md`. A copy of both is in `~/.brain-archive/spool-foundation/spikes/`. The fifteen samples are side by side on one page: on devobee run `cd ~/agent-hub/projects/spool-next/spikes/frame-formats && pnpm install && node server.mjs 7741`, then open http://127.0.0.1:7741/ through `ssh -L 7741:127.0.0.1:7741 devobee`.

The formats were A TSX; B HTML+CSS+script; C OpenUI Lang over our own catalog; D Rive RML (CLI only, signed out); and E, a sketch of our own language.

**Speed** (m1, headed Chrome 157, 5 runs, load 5 to 17):
- **One frame:** every browser format reached its first picture in 64 to 131 ms. B was fastest and C slowest.
- **A hundred copies:** iframe or not decides it, more than the format does.
  - As 100 iframes, every format panned at the same rate: 72 fps (app), 26 (slide), 43 (poster). Drawing all 100 took 0.6 to 1.8 s.
  - In one document, where only C and E can go because they run no agent code, they drew in 23 to 51 ms (E) and 184 to 278 ms (C). They panned at 116 to 120 fps (app, slide) and 85 fps (poster).
  - E's only feature that brings an iframe back is its `code` escape.
- **D:** Rive's own renderer drew 100 app artboards in 6.2 ms p95 per frame. That is not comparable to browser frame pacing.

**Agent writing** (2 tries per model, Claude and Codex, cut from 3 for cost; 60 tries, plus 4 D app re-runs):
- A, B and C passed every try: 36 of 36.
- E passed 10 of 12 and D 10 of 12, every miss on the app. D's count is after a fix to its teaching page; the first 4 D app tries all failed the build because of a mistake in the page.
- E's output was the shortest for every sample (app median 1,054 tokens against TSX's 1,736). D was 4.5 times TSX.
- A static check at write time would have caught 1 of the 4 failures (E's parser).

**Hand edits:**
- E and D wrote back every edit except computed text as one line. D's list name is written twice, so it took two.
- TSX, through today's planner, refuses text from a list.
- OpenUI can't nudge a laid-out thing, and its list edit left the sheet's copy of the name stale.

**D, plainly:**
- Making a `.riv` needs `rive login` and a publish signed by Rive's servers, 50 a month on the free plan.
- Free exports play a Rive splash screen.

**Not measured:**
- the third try;
- D in a browser;
- the time from a file write to the edit showing;
- Figma import;
- merges;
- thousands of frames (#343).

Not closing: 634 judges it.

### agent, 2026-11-13T18:40:41.635Z

**Judged by task 634, 2026-11-13: it is the thing asked for.** Results: `spikes/frame-formats/RESULTS.md` and `FORMAT-E.md` in liamvinberg/spool-next (copies in `~/.brain-archive/spool-foundation/spikes/`); the fifteen things side by side at http://devobee.tail9e5223.ts.net:7741/ while the server runs.

What it settles for #342:
- **Speed follows from whether a frame runs agent code, not from the language.** A hundred frames that run none (the catalog format, format E) share one document: drawn in 23 to 51 ms (E) and panned at 116 to 120 frames a second; the same hundred as iframes took 0.6 to 1.8 s and 26 to 73. Any format that runs agent code needs the iframe.
- **Agents write what they know without a miss** (TSX, HTML, and the small catalog: 36 of 36). Format E and Rive missed 2 of 12 each, all on the app screen, writing blind; one of E's two would have been caught by its parser. E was the shortest to write (about 60% of TSX's tokens). Small sample: 4 tries per cell.
- **Hand edits:** E wrote every edit back as one line, including a name that comes from a list, which today's TSX refuses.
- **Rive is out as spool's own format:** showing a frame outside Rive's CLI needs a signed publish through their servers per edit, and free exports carry a splash screen. Its renderer is the speed to envy (100 app screens in 6.2 ms a frame).

What it leaves open, carried to #342 and #343: whether one document still holds at 1,000 frames (asked of the canvas spike as a fifth design); how many frames need real code; a check an agent can run while writing; whether E could be drawn without a browser.
