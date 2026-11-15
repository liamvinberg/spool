# #333 · Wayfinder map: spool from the ground up, the foundation

- State: closed (moved to spool-next)
- Labels: wayfinder:map
- Created: 2026-11-13T14:47:10.942Z
- Updated: 2026-11-14T11:38:33.458Z
- Closed: 2026-11-14T10:28:43.260Z

## Destination

A new spool, written from the ground up in its own repo: a small core that is fast before it is anything else, with an extension system everything else is built on, grown piece by piece and usable daily through a beta build of its own. This map finds the foundation, the decisions everything else stands on, and ends in the first specs: a walking skeleton to build, and the order the rest follows in.

## Notes

**Decided by Liam, do not reopen** (task 634, 2026-11-13): "i will want to just rebuild spool from scratch, i guess a new repo or something or a branch or something just from the ground up ... ive decided to rebuild this so dont tell me otherwise we should just navigate the path forward into this, i want it really thorough". And: "i want a solid core and foundation ... the extensibility is i think a really nice part of spool". Extensibility stays; how it is shaped is open.

**Everything else is open, as if nothing was decided.** His words: "some core grilling sessions to just navigate things as if we didnt decide anything yet". Earlier rulings are evidence with reasons, not rules: the old map (#251) and its tickets, spec #284 with its tickets (closed, superseded by this map), the ADRs in `docs/adr/`, tasks 141 and 449 (Rust, GPUI and Rune turned down). A ticket here that meets one reads why it was made and decides again.

**What he asked to have navigated** (his words, same message): a new repo or a branch; the beta workflow for it once it is usable; the extension system first; "very performant ... i just want things to feel snappy fast, where we probably ofcourse utilize webgl or the most performant libraries and capabilities, and ofcourse do smart things like image replacement that looks identical and when zooming in it goes live"; "maybe it isnt tsx, maybe we write our own language ... maybe we spike that"; "should we build it in rust"; whether the folder is still `design/`; what the SDK looks like; the skill system; "maybe we should rebuild cloud aswell?"; "probably fully agent native ... but ... you can like atleast edit text"; "something people from figma can port to"; decks are part of it; "piece by piece build spool up, but will probably use spool to build the new version of spool aswell".

**What spool is for** (Liam, 2026-11-13): "The goal of spool is a canvas for creative work in the age of agents ... it should be a place where you are comfortable being in, and where you do creative work, no matter who you are, im no designer, but like people just wanting to do presentations, its core should adapt to people, maybe we will have ways where you can draw what you want ... how figma people has a feeling like its their home we want a similar experience for spool. Ofcourse might be that you need to learn a bit but we will build this up". For this map it means: the foundation must not assume the person is a designer or a developer, and must leave room for input that is not typing (drawing, pointing).

**Experiments** (Liam, same day): "do whatever experiments you want etc to establish some groundwork before we begin". Spikes on this map start without asking again; a product build still starts on his go.

**Two maps.** This one is *how spool is built*. *What spool is* (which features stay, change, go or are new, how you point, say, play and arrange, and the look) belongs to the rethink: root thread task 655 (`~/.brain-archive/spool-rethink/map.md`), the look in task 666, playing in task 624. A question about a feature or a screen goes there. A question about what features stand on comes here.

**How decisions are made here.**
- Performance is measured, on Liam's m1, before and after. A claim without a number does not decide anything.
- A technical choice with a real alternative gets a spike: the smallest thing that can be measured or tried, thrown away afterwards.
- Engineering calls are the agent's to make and explain in plain words. Taste (look, naming, how it feels) is Liam's, shown as live frames through the loom skill, never as images.
- With Liam: plain language, answer first, one point at a time, numbered questions each with a recommendation, no jargon without a one-line definition, no em-dashes.
- The size of a rewrite is not a cost. Tokens are: research and reading run in Codex workers (`explorer`, `researcher`), one worker per question.
- The m1 is shared: each task takes its own lane and port, and puts a time limit on every command that could wait for input.

**Where things are.** Research notes and spikes' results: `~/.brain-archive/spool-foundation/` on devobee. Today's spool: this repo at 0.56.0 (about 187,000 lines of code and 125,000 of tests; the window is `src/ui/canvas/`, the engine `src/daemon/`, the frame runtime `src/runtime/`), spool-cloud at `~/dev/projects/spool-cloud`. An inventory of every part of today's window: `~/.brain-archive/spool-rethink/scouts/inventory-of-spool-today.md`. The old plan's working notes: `~/.brain-archive/core-spec/`.

**Held by** task 634.

## Decisions so far

- #336 The evidence so far: the still renderer, the player split and the tldraw licence objection rest on real evidence; the turning down of Rust, GPUI and WebGPU, the warm pool, and TSX as the format were never tested against an alternative, so the spikes (#341, #343) and #345 start from open questions, not from a default.
- #337 How fast canvases are built: tools that draw their own shapes are fast, but none of them draws a web document; no one has published thousands of live web documents on one canvas. Four designs go to the spike #343: GPU pictures plus bounded live DOM (today's, the line to beat), culled DOM, HTML-in-Canvas (stable in Chrome 157, new since spool's canvas was designed), and a native compositor over browser surfaces.
- #338 Ways to write a design: the format and what draws it are separate choices; no one has measured how well models write the alternatives against React on work like spool's, so the spike #341 is the evidence. Its candidates beside TSX: plain HTML and CSS with a small behaviour layer, a catalog format (OpenUI or json-render), Rive RML, and a sketch of a language of our own.
- #334 What fast means: the m1 is the floor; the target is a real project of about 1,000 frames at 120 frames a second while panning and zooming (his largest today is 856), opening in under a second, an agent's edit showing in under 0.3 seconds, many projects costing nothing, idle being idle; 5,000 frames is a guard that stays usable (never under 60), not something to over-optimise for. Six principles are on the ticket: fast and measured; a small clean core with extensions; words first; made for people to love using; nothing lost, nothing flickers; frame code never runs with spool's power.
- #340 Repo, name, beta loop: a new repo and project, spool-next (the project exists; the repo comes with the first code worth keeping). Today's spool takes fixes only. The new app is Spool Next beside Spool and Spool Beta, with its own state, port and beta build as part of the walking skeleton.
- #339 Engine and shell options: Rust cannot replace the browser while frames are web code; it could own the CLI (starts in 1.5 ms against Node's 26), the engine and a renderer of ours. The shell is a choice of browser engine: Electron's chosen Chromium (HTML-in-Canvas, 120 Hz) against Tauri's WKWebView (smaller, but 60 Hz reported and no way found to hand pages to a GPU scene); CEF is the route for a native GPU app. esbuild is the only compiler with a documented incremental in-memory rebuild. Decided in #345, after the drawing spike.
- #341 Three frames, five formats (spike, in spool-next `spikes/frame-formats/`): speed follows from whether a frame runs agent code, not from the language: a hundred frames of a format that runs none share one document (drawn in 23 to 51 ms, panned at 116 to 120 frames a second) against 0.6 to 1.8 s and 26 to 73 as iframes. Agents wrote TSX, HTML and a catalog format without a miss; our own sketch (format E) missed 2 of 12 writing blind, was the shortest to write, and wrote every hand edit back as one line. Rive is out as spool's own format (a signed publish per edit, a splash screen on free exports).
- #343 The drawing spike (in spool-next `spikes/canvas-drawing/`, measured on the m1): GPU pictures far out are needed whatever the frames are, since every design that leaves the whole page to the browser fails there. GPU pictures with live frames over them holds at 1,000 and 5,000 alike (88 to 117 presented a second against a ceiling of 114 on the loaded m1). HTML-in-Canvas is as fast with an identical swap but cannot draw a frame from another origin, so it cannot keep the safety line. A native compositor works and buys no frames while costing input, focus and text entry. Frames that run no agent code go live in 16 to 46 ms in the page's own document, against about a second for an iframe.
- (open) #342 What a frame is, so far: Liam accepts that a design frame is a design with code made from it afterwards, and wants a language of our own taken seriously, "dedicated to making kind of frames", with validation built in. Round two (#354) tests three shapes of it, a checker, harder samples, merging by meaning, a compiler out to React and the interpreter as a safety line, before he picks.
- #335 Where today's spool spends its time: closed without an m1 pass of today's spool (the screen was never free). The canvas side is answered by #343. The engine side is known roughly from devobee: an edit shows after about 3.6 s, opening takes about 2.4 s, picture to live about 6 s, so today's gap to the budget is mostly in the engine, not in the drawing. #345 measures those on the m1, headless, if it turns on them.
- #354 A frame language of our own, round two: it holds up. With a checker agents write it nearly as reliably as TSX (15 and 14 of 16 against 16) in fewer tokens, every hand edit is one line, merging by names works where line merge fails, it compiles out to React, and nothing hostile escaped. The look of the syntax did not change quality (blind judges could not tell); the line-based look is dropped, and the typed-and-braced or the JSX-like look is Liam's pick. All 12 of his real frames ported at rest, 3 with one box of real code, but hover, timers and dragging were lost: which of those the language takes in is settled in #342. Heavy frames still need GPU pictures when zoomed out.
- Liam, 2026-11-14: our own language is the direction for frames, with his projects ported and redone to fit it; real code lives in boxes inside a frame. Start from the typed-and-braced look in the style of Rust and Swift; take the best from existing languages rather than inventing from nothing (#355); keep it as its own piece, since it may be released for others. He leaves the engineering of it to the brain's recommendation.
- #355 Prior art, four notes: the language stays typed, named data with a 13-part feature map and real code only in code boxes; it is built as one Rust core for the command line and the browser; both researchers lean to the browser drawing live frames with GPU pictures far out, in Electron and the hosted browser, with a native app (Rune, GPUI) measured in a bounded spike before anything is chosen.
- **2026-11-14: this map moves to project spool-next** at Liam's ask (its own tracker, a brain task there, autopilot as the orchestrator), re-charted around frames in our own language. Handoff: `~/.brain-archive/spool-foundation/handoff-to-spool-next.md`. The new task closes this map and its open children as moved.

## Not yet specified

- Undo: one stack across a person's hands, agents and teammates, on whatever the files turn out to be.
- Editing by hand (he wants at least text): what it can be depends on what a frame is.
- Importing from Figma, and what "port to" needs: a file import, a paste, or only a familiar window.
- Moving today's projects and team canvases over, and whether the old and the new spool can open the same project.
- Decks, playing and the player on the new foundation: after the rethink says what they are.
- The trust line. Today: nothing an agent or a project wrote ever runs in spool's own window; frames run on a separate origin. Whether it is drawn in the same place depends on what a frame is and how the canvas is drawn.
- Tests: what the new repo's proof looks like from the first commit (speed and motion on captured frames as a gate, not a later pass).
- What the first extensions are, once the rethink has a list of features.

## Out of scope

- Which features the rebuilt spool has, and how they look and work: the rethink (task 655) and its threads.
- Today's spool beyond fixes: it stays Liam's daily tool, through Spool Beta, until the new one can replace it.

## Comments

### agent, 2026-11-14T10:28:43.260Z

Moved to project spool-next and re-charted as spool-next#1 (the core) and spool-next#16 (the frame language, parked), held by task 682. Every open child here was closed with a pointer to its successor.

### agent, 2026-11-14T11:38:33.458Z

From the look exploration's round 4 (ten layout ideas drawn in spark, task 666), closed by Liam in task 679 on 2026-11-16: none changes the core of spool, "maybe we will explore this later". Three ideas to carry, frames kept on the rethink canvas at `explore/look/{focus,filmstrip,grid}-{canvas,how}`; the other seven are deleted.

- **Workspaces (from focus)**: like Blender's workspace tabs, "maybe we can have something similar in spool". His doubt: in Blender they change your toolset, and "in spool like agents kind of draw everything so i dont know". Belongs with the window pieces.
- **Flows shown and labelled by the agent (from filmstrip)**: "not like the pane below but like how maybe we could have so agents atleast could label, and show flows this way, show the states of screens". Belongs with flows and play.
- **A grid as a view of a page (from grid)**: what he meant by a grid was the whole canvas snapping to locations. "i feel like canvas should be free, maybe though it becomes a view for a page or a page can be this". Belongs with Arrange (piece 9).
