# #354 · A frame language of our own, round two: three shapes, a checker, harder work

- State: closed
- Labels: wayfinder:prototype
- Parent: #333
- Tasks: task 680 (Frame language spike round two)
- Created: 2026-11-13T20:40:43.466Z
- Updated: 2026-11-13T23:29:24.358Z
- Closed: 2026-11-13T23:29:24.358Z

## Question

If spool gets a frame language of its own, what should it look like, how far should it go, and does it hold up on harder work than three samples?

This is the second language spike, following spool#341 (read its results first: `spikes/frame-formats/RESULTS.md` and `FORMAT-E.md` in the spool-next repo, `~/agent-hub/projects/spool-next`). Throwaway code that exists to be measured and looked at. Its answer is tables and pages Liam can open; the ticket after it (spool#342, "What a frame is") decides with him. You decide nothing about the product, and name nothing: the takes are called by letter.

## Where this stands

Spool is "a canvas for creative work in the age of agents" (Liam): a person says in words what they want, an agent writes it as a *frame*, frames stand on a zoomable canvas, and the person says what they like, edits by hand at least the text, and iterates. Liam is rebuilding it from the ground up as spool-next and wants each foundation question answered by evidence.

What the first two spikes found (spool#341, spool#343, both on the map spool#333):
- A frame that runs code an agent wrote must sit in a sandboxed iframe on another origin. A frame in a format that runs none (a sketch of our own, "format E", read by an interpreter with no `eval`) can live in the canvas page's own document: a hundred drew in 23 to 51 ms against about a second, and going live on the canvas takes 16 to 46 ms against about a second.
- Agents wrote format E shorter than TSX (about 60% of the tokens) but less reliably when writing blind (10 of 12 against 12 of 12), and only one of its failures was caught by its parser.
- Every hand edit in format E was written back as one changed line.

What Liam said on seeing that (task 634, 2026-11-13): "an idea I had is that we make our own language like fully, maybe inspired by rust ... dedicated to making kind of frames, that are interactive etc, though I don't know how much quality we lose, but here we could build in good validation etc ... we bring good patterns from different parts of programming languages ... Could we make 3d etc or should we just keep tsx cause it's easy to port from prototype to the application? I mean for creative work though like presentations there is no porting". He pointed at Kit Langton's language blood (announced 2026-11-07; no source is public, so there is nothing to read or reuse: only its stated ideas, which are content-addressed code kept in a database rather than text files, merging by meaning rather than by line, an interpreted mode for instant feedback with a compiled one for release, effects in the types, and that agents write it while people only read results).

So the direction to test is a **frame language of our own, for the design kind of frame**, with TSX kept as the code kind for prototypes that must be real. This spike finds out what that language should be.

## The takes

The same meaning in three shapes, so the shape can be judged apart from the idea. Each take covers the same things: named objects, free placement and layout, text, images, shapes and paths, lists and repetition, declared states with transitions, one-off motion, computed text, actions on tap, and a box of real code (TSX in a sandboxed iframe) as the escape.

- **Take L, line-based**: format E grown up. One thing per line, indentation for nesting, `key value` pairs.
- **Take R, typed and braced**, the shape Liam asked about ("maybe inspired by rust"): things as typed constructors with named arguments, enums for the closed choices, units on numbers (`22px`, `360ms`, `50%`), `state` and `let` as declarations, braces for nesting. It should read like a modern typed language (Rust, Swift, Kotlin) and still be data: no loops or functions an agent can write, only declarations and expressions.
- **Take J, a strict subset of JSX**: looks like the TSX agents already write (tags, props, a fixed set of components, `class`-free: properties as props), with state and lists declared in a small header and `{...}` allowed only as the same small expression language. It is parsed as data and never executed. The point of this take: models know JSX by heart, and what is nearly React is nearly portable.

All three compile to **one model** (a tree of named things with typed properties, states, lists, expressions) and are drawn by **one interpreter**, so speed is the same by construction and only writing, checking, editing and reading differ. Reuse and extend format E's interpreter (`spikes/frame-formats/runtimes/e/`).

## What every take must have that format E lacked

1. **A checker an agent can run**: `check <file>` answers in well under a second with errors that name the line, the thing, what was expected and a fix ("leading takes a multiple like 1.2, or a length like 38px; got 38"). Types on every property, units on every length, time and angle (a bare number where a unit is needed is an error), names unique and resolved, every state, list, motion and thing a line refers to must exist, colours and assets must resolve. The two failures of spool#341 that a check could have caught must be caught.
2. **Things have an identity that is not their line**: a stable name per thing, so an edit is "change this property of that thing" whatever lines moved.

## What to measure and try

**1. Agents writing it, blind and with the checker.** As in spool#341 (fresh worker per try, the same teaching page of at most 150 lines per take with equal care, the same words, then a change request; Claude `anthropic/claude-opus-5-5` and Codex `agent: "codex"`; two tries per cell), with TSX as the line to beat, in two conditions: **blind** (read, write, edit only) and **with the check** (the worker may run the take's checker, and for TSX a typecheck, as often as it likes; nothing else). Count: ran, right, change landed, tokens, time, and how many check rounds it took. Judge from captures against checklists written before looking. Samples, harder than last time:
   - the **app** screen from spool#341 (so the numbers join up);
   - a **flow**: three screens with navigation between them and one shared piece of state (the bag) carried across;
   - a **deck slide with steps**: four things that appear one by one on click, the last one moving the others;
   - a **board**: free shapes, a hand-drawn path, a few pictures, text at angles: nothing laid out;
   - a **form**: two inputs, a choice, validation that shows a message, a disabled button until valid;
   - a **chart**: bars from a list of numbers, a label per bar, the tallest highlighted;
   - **depth**: a card that tilts in 3D towards the pointer, and a stack of three cards fanned in perspective. Liam asked "could we make 3d etc": say what each take can express with the browser drawing it (CSS 3D transforms), and where real 3D (a mesh, a camera, lights) would have to live (a kind of thing in the language drawn with WebGL, or the code box).
   Where a sample cannot be said in the language without the code box, that is a finding: record what was missing, and do not grow the language past what three or four samples need without noting each addition.

**2. Hand edits.** The five edits of spool#341 on each take, plus: resize a thing, recolour a thing, change a font size, delete a thing, duplicate a thing, and reorder two things in a layout. Report each write-back as a diff.

**3. Merging by meaning.** Liam's canvases are edited by a person, agents and teammates at once. Take six pairs of edits to the same frame made from the same starting point (a hand moves a thing while an agent rewrites its text; two agents each add a thing in the same place; one renames a thing the other restyles; one reorders a list the other edits an item of; one deletes a thing the other changes; both change the same property), and merge each pair two ways: git's line merge on the source text, and a merge on the model by the things' names (three-way, property by property). Count clean merges, wrong merges and true conflicts for each take and for TSX. This is the cheapest test of whether "merging by meaning" is worth building.

**4. Out to React.** A compiler from the model to a TSX file a developer would keep: components for repeated things, `useState` for the states, plain CSS or Tailwind for the properties. Run it on the app and the flow, check the result draws the same (pixel compare at each state), and show the output. This answers Liam's worry about porting a prototype to the application. Say what does not survive the trip.

**5. Heavier frames in one document.** Spool's real frames have about 400 elements; format E's samples about 25. Write (or generate from the model) frames of about 400 things, put a hundred in one document as spool#341 did, and measure draw time and panning on the m1 the same way (`tools/measure.mjs` there; Chrome for Testing 157 is at `~/scratch/spool-next-spikes/chrome` on the m1; take the screen slot and the lock `mkdir ~/scratch/spool-next-measure.lock` as that spike did, build everything on devobee first).

**6. Is the interpreter a line to trust?** A frame in this language runs in spool's own document, so the interpreter is all that stands between what an agent or a stranger's project wrote and spool. List every way text from a frame reaches the page (words, property values, colours, URLs, asset paths, font names, the expression language, the code box's source path) and what each could do if hostile; then try to break it: a few hundred hostile and malformed frames through the parser and interpreter, checking that no script runs, no request leaves for a host that is not the project's own, no style escapes its thing, and nothing outside the frame's box is touched. Say plainly what you would still not trust.

## What done looks like

- `RESULTS.md` in `spikes/frame-language/`, and a copy at `~/.brain-archive/spool-foundation/spikes/frame-language.md`: the tables for 1 to 6, a paragraph per take on what it is like to write, read and check, what was added to the language along the way, what was not measured and why. Plain language. No recommendation on what spool should choose: end with "what the numbers say" and the open questions.
- A grammar-by-example page per take, each showing **the same** poster and the same app screen first, so the three can be read side by side.
- One local page on devobee that shows every sample in every take beside its source, live and clickable (a command and a URL), and screenshots.

## Where it lives

The repo `liamvinberg/spool-next` (project spool-next, main checkout `~/agent-hub/projects/spool-next`; your task has its own worktree and branch). Put the spike in `spikes/frame-language/`; you may import from `spikes/frame-formats/` but copy rather than change what is there. Nothing under `spikes/` is ever imported by product code; set up no product structure, tooling or CI. Commits atomic, lowercase, terse, no body. When done, bring your branch up to date with main, merge it to main and push.

## Rules

- Claim this ticket first: `update_ticket({ ticket: "spool#354", claim: true })`.
- Put a time limit on every command that could wait for input or hang.
- You may hand parts to workers; keep the model, the interpreter and the judging yours so every take is treated alike. Say where a teaching page, a fix or a re-run may have favoured a take, as spool#341's results did.
- If cost must be cut, cut in this order: the chart, the form, then the second model on the blind condition. Do not cut the check condition, the merge test or the React compiler.
- Before any choice this page does not settle and that would change what is measured, message task 634 (`message_task`) and go on with your best guess meanwhile.
- When done: comment the results' summary on this ticket (do not close it, task 634 judges it first), message task 634 with a few lines and where everything is, then close your own task.
- Clean up: your lock, your servers, and say what you left on the m1.

## Comments

### agent, 2026-11-13T23:27:31.022Z

## Results (task 680)

Merged to spool-next main (3d94a42). Results: `spikes/frame-language/RESULTS.md`, copied to `~/.brain-archive/spool-foundation/spikes/frame-language.md`. Pages: `cd ~/agent-hub/projects/spool-next/spikes/frame-language && node server.mjs 7742`, then http://127.0.0.1:7742/ (samples live beside source, with screenshots), `/pages/grammar-{l,r,j}.html`, `/pages/ports/`, `/pages/landing/` (key hidden), `/pages/hostile.html`.

- **One core:** L, R and J compile to one model, drawn by one interpreter and checked by one checker (about 2 ms a file).
- **1. Agents (128 tries):** make and change both right in L 22/32, R 27, J 26, TSX 29. Files were 15% to 31% smaller than TSX's. With the checker: R 15/16, J 14, TSX 16, L 10 (L's failures were ones the checker can't see). The commonest failure: what covers what on the free board (14 tries, none in TSX).
- **2. Hand edits:** 11 of 12 edits are one line in every take. Retyping computed text is refused on purpose.
- **3. Merges:** line merge clean on 1 of the 5 pairs that should merge, in every take and TSX. Model merge by names clean on 5 of 5, both true conflicts found, 0 wrong.
- **4. Out to React:** app and flow match pixel for pixel at every state, except text smoothing in one state each (38 and 86 px). Names and merging don't survive the trip.
- **5. Heavy (m1):** 100 frames of 487 things in one document were ready in about 450 ms at 17.5 fps, against TSX in 100 iframes at 2.2 to 2.5 s and 5 to 6.5 fps.
- **6. Trust:** 414 hostile and malformed frames. 0 scripts, 0 requests elsewhere, 0 style escapes, 0 outside the box. One hang (a nested list) is now capped by a 20,000-thing draw budget. The code box depends on its CSP.
- **A. Parts and kits:** in all three takes. The ports used 4 to 21 parts each.
- **B. 12 real frames into R:** 9 with no code box, 3 with one (two WebGL or canvas backgrounds, one three.js model). None unportable. 0.1% to 2.3% of pixels differ at rest. All lost behaviour: hover 10/12, timers 6, dragging 5. A scan of all 1,148 frames: about 18% would need a code box, and about 82% would port without one, but nearly all lose hover or timers.
- **C. Landing pages:** three blind judges agreed (Kendall's W 0.97). Takes did not differ (mean rank 8.1 to 9.1 of 16). Models did: Codex 4.5, Claude 12.5. Every Claude page overran the asked height, in every take and TSX.

No recommendation, per the ticket. RESULTS.md ends with what the numbers say and six open questions.

### agent, 2026-11-13T23:29:24.358Z

**Judged and closed by task 634, 2026-11-14.** The builder's summary is above; results in spool-next `spikes/frame-language/RESULTS.md` (copy `~/.brain-archive/spool-foundation/spikes/frame-language.md`). Pages while the server runs: http://devobee.tail9e5223.ts.net:7742/ (samples), `/pages/grammar-{l,r,j}.html`, `/pages/ports/`, `/pages/landing/`, `/pages/hostile.html`.

What I take from it for #342:
- **A frame language of our own holds up as a way to write frames.** With its checker, agents were right 15 of 16 (R) and 14 of 16 (J) against 16 of 16 for TSX, in 15 to 31% fewer tokens; every hand edit is one line; merging by names merged 5 of 5 pairs against 1 of 5 for git; it compiles out to React with the same pixels; 414 hostile frames got nothing out of the box.
- **The shape does not decide quality.** R and J are within a try or two of each other everywhere, and blind judges could not tell the takes' landing pages apart (the model mattered, by 8 places of 16). **L is dropped** (22 of 32, and worse with the checker than without). R or J is Liam's pick.
- **It does not replace TSX as it stands.** All 12 real frames ported at rest (9 with no code box, 3 with one for a WebGL, canvas or three.js part), but 10 of 12 lost hover, 6 lost timers, 5 lost dragging, and most wanted one-sided borders, styled runs inside a text, and gradients. Those are the gaps to settle in #342: which become part of the language (my read: hover, pressed and focus looks, timers and delays, borders, text runs, gradients, scrolling, parts with more than one slot and actions as parameters) and which stay in a code box (canvases, shaders, 3D, free dragging).
- **Speed, read with care.** A hundred heavy frames (487 things each) in one document were ready in 0.45 s against 2.2 to 2.5 s as iframes, but panned at 17.5 a second, the same as React in one document: the cost at that size is the number of things on the page, not the language. So pictures drawn by the GPU when zoomed out stay necessary (as #343 said), and what the language buys is going live at once and no sandbox.
- **Carried to later tickets:** the checker should also run the layout and report what a static read cannot see ("runs past the frame's bottom by 300 px" was every Claude landing failure; things covering each other on a free board was 14 of 24 failed tries) → #349. The code box needs caps on CPU, memory and WebGL contexts, and a way to take data → #342 and #350. The trip to React is one-way → #342.
- **Not shown:** a frame whose main act is dragging or panning; agent tries on form, chart and depth; ports by another model or in J.
