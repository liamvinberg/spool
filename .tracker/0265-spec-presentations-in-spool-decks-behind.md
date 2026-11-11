# #265 · Spec: presentations in spool (decks), behind the experiment `deck`

- State: open
- Labels: ready-for-agent
- Created: 2026-11-10T17:59:11.432Z
- Updated: 2026-11-10T19:41:38.183Z

## Problem Statement

spool.page says "a deck is frames too", but nobody can give a talk from spool. A person who works through a coding agent can have it write beautiful live slides as frames, and then has nowhere to put them in order, no notes, no way to step through them, and no screen to show a room. Liam has a user waiting who wants to build presentations in spool.

## Solution

Behind the experiment `deck`, a page can be a **deck**. Its top row of frames is the **talk**, in order, on a quiet full-width **band**; every other frame on the page is **loose** and sits in a grid where its place means nothing. A slide names its **beats** in code, and each beat has a paragraph of **notes**. Double-click a slide and the camera flies in and the talk plays in place, exactly as a room will see it. Present opens the **room's screen**, which shows the slide and nothing else, while spool's own window becomes the **presenter view**: the clock, the slide live, what the next key plays, this beat's notes.

The design is decided and drawn. It is `deck-line`, adopted on the team canvas as `app/spool-deck`, `spool-deck--new`, `--present`, `--presenter` and `--inside` (code in `shared/ui/spool/deck/`). Those frames are the reference for look, feel, motion and every constant: play them before building anything they show, and where this spec and the frames disagree on look or feel, the frames win. The resolution on ticket #255 holds the decisions in Liam's words and everything that was turned down.

This is built on today's spool, not on the extension core that is being designed (map #251). It ships under the experiment so Liam's user can use it now; when the core is rebuilt it moves onto it as the first official extension. So it is built to be lifted out: its own modules per layer, few call sites in the existing canvas, and nothing else in spool depending on it.

## User Stories

Making a deck

1. As someone starting a talk, I want New presentation beside New page, so that I get a deck page with five starter slides already designed instead of an empty canvas.
2. As someone starting a talk, I want the Agent composer focused and asking "What's the talk about?" right after, so that my first move is telling my agent.
3. As an agent, I want a deck to be plain files (a `deck.json` in the page's folder, a `notes.md` beside a slide), so that I can write a whole talk by writing files, with no verb to call.
4. As an agent, I want spool to place the slides I list, so that I state the order and the size and never guess coordinates.
5. As a person, I want the band behind the top row, so that I can see that a frame on it plays and a frame off it does not.
6. As a person, I want to drag a frame between two slides to add it to the talk, so that building the order is direct.
7. As a person, I want to drag a frame onto a slide to trade the two, so that trying another version of a slide is one gesture, and the version takes over that place's notes.
8. As a person, I want to drag a slide off the band to skip it, so that I can cut a slide without deleting it.
9. As a person, I want to drag along the band to reorder, with one outline showing where the frame will land, so that I never wonder what a drop will do.
10. As a person, I want several frames dragged onto the band to join in the order they had, so that I can bring a section in at once.
11. As a person, I want loose frames to sit in a tidy grid, so that drafts never push the talk around.
12. As a person, I want one size for the whole talk in Properties, so that changing it resizes every slide at once.
13. As a person, I want a frame of another shape to keep its size when it joins the talk and be shown fitted and centred, so that a phone prototype can be a slide.
14. As a person, I want the Pages list to stay plain names (the talk in order, a hairline, the loose frames), so that the rail is not bloated with thumbnails.
15. As a person, I want to drag a row across the hairline in Pages, so that I can add or cut a slide from the rail too.
16. As a person, I want notes as a section in Properties, one paragraph per beat, so that what I say sits with the slide.
17. As a person, I want undo to reverse any of these in one step, so that a wrong drop costs nothing.
18. As a person, I want the page to still pan, zoom, multi-select, duplicate and trash like any canvas, so that a deck is still spool.
19. As a teammate, I want a deck in a team project to sync like any other files, so that two of us can work on one talk.
20. As someone with the experiment off, or on an older spool, or viewing on spool.page, I want a deck page to show as an ordinary page with its frames where they were laid out, so that nothing is lost without the feature.

Slides

21. As an agent, I want one call that names a slide's beats and tells the slide which beat it is on, so that builds and reveals are ordinary code.
22. As an agent, I want a slide outside a talk (on the canvas, in a still, in ordinary play) to read as its last beat, so that every slide shows complete wherever it is seen.
23. As an agent, I want to mark a slide as live, so that clicks reach the prototype on it instead of advancing the talk.
24. As an agent, I want two slides that share an element to carry it across as one object by giving it the same view-transition name, and slides that share nothing to dissolve, so that transitions are code I write and there is no transition panel.
25. As an agent, I want `spool check` and `spool skill deck` to tell me what a deck needs, so that I get it right without Liam explaining.

Rehearsing

26. As a presenter, I want double-click or Enter on a slide to fly in and make it live, so that rehearsing is one gesture.
27. As a presenter, I want the talk to play in place from there with the same keys as on stage, so that rehearsing is presenting without the second screen.
28. As a presenter, I want Esc to fly me back to exactly where I was, so that going in and out never loses my place on the canvas.
29. As a presenter editing with my agent while inside a slide, I want a saved change to appear without losing my slide and beat, so that I can tune a build in place.

Presenting

30. As a presenter, I want Present on a slide's name label, on the page's row, and on ⌘↵ (⇧⌘↵ from the first slide), so that starting is where my hand already is.
31. As a presenter, I want the keys I know from PowerPoint and Keynote, so that I never think about them on stage.
32. As a presenter, I want my clicker to always move the talk, so that it works while a live slide has the keyboard.
33. As a presenter, I want the room's screen to show only the slide, with no controls and no cursor, ever.
34. As a presenter, I want the presenter view to show the clock, the slide live, what the next key plays, this beat's notes and a bar per slide with a segment per beat, so that I know where I am in the whole talk.
35. As a presenter, I want the next slide to appear the instant I press the key, with no wait, blank frame or unstyled flash, so that live code is as dependable as PowerPoint.
36. As a presenter, I want a broken slide to never reach the room: the room keeps its last picture, I see the problem in my view, and the next key still moves on.
37. As a presenter, I want to know before I reach it that a slide is broken or still loading, so that I can skip it.
38. As a presenter, I want to click and type in a live slide from my view while the room sees it happen, with my pointer as a soft dot, so that I can demo a prototype mid-talk.
39. As a presenter, I want Tab to hand the whole keyboard to a slide that uses arrows itself and Esc to take it back, so that a live slide and the talk never fight over keys.
40. As a presenter, I want B to black the room, F to freeze it while I look ahead, R to restart a slide, and ? to list the keys, so that I have the stage controls I expect.
41. As a presenter with two displays in the Mac app, I want the room to open full screen on the other display and X to swap them, so that I never drag windows on stage.
42. As a presenter with one display or in a browser, I want the room as a window I can move or share in a call, so that presenting works everywhere.
43. As a presenter, I want ending the talk to bring me back to the canvas with the slide I ended on selected.

## Implementation Decisions

**Scope and shape**

- Everything stands behind the experiment `deck`, stage experimental, off by default. Off is absent, as the glossary's Experiment entry requires: no band, no menu item, no keys, no routes answering, no automatic writes. The frame calls are the exception: they always exist in the `spool` import and fall back (below), so a frame that calls them never breaks on a machine with the experiment off.
- The deck's code lives in modules of its own per layer (shared model, daemon, window, runtime), with the existing canvas, rail, Properties and player gaining call sites only. Nothing outside the deck's modules imports from them except those call sites. This is what makes it liftable onto the extension core later.
- The glossary gains: Deck, Talk, Band, Slide, Loose frame, Beat, Notes (of a slide), Room, Presenter view.

**A deck on disk**

- A page is a deck when its folder holds a `deck.json`. Shape (version 1): the talk's size (`w`, `h`, default 1280 by 720, limits 240 to 3840 by 2160) and `slides`, the ordered list of the talk's frames by their folder name within the page. It is written one name per line so that team sync's line merge can merge two people's edits. Every frame of the page not listed is loose. Reading is forgiving: unknown keys are kept on write, a name with no frame is skipped, a repeated name counts once, and bytes that do not parse are a write in flight and leave the page showing as an ordinary page.
- Notes are a `notes.md` beside a slide's `frame.tsx`. Paragraphs separated by a blank line are the beats' notes in order; paragraphs beyond the last beat show with the last beat. Notes travel with the frame's folder (duplicate, move, trash, history and sync already carry sibling files). A frame never imports its notes.
- **Places are written, and the order is the truth.** One pure function lays a deck out: slide `i` of the talk at `x = i * (w + 160)`, `y = 0`; loose frames in cells with column stride `w + 160` and row stride `h + 320`, the first loose row at `y = h + 640`; a frame of another size centred in its cell. The daemon writes those places into the geometry sidecars, so everything that reads a frame's place today (pictures, peek, exports, stills, an agent reading `frame.json`, spool.page, a machine with the experiment off) is right without knowing what a deck is. This was chosen over computing places at read time, which the engine research (#253) suggested: computed places would have to be taught to every reader, and would leave a deck a scrambled page wherever the feature is absent. The cost is that a reorder saves one small file per slide that moved.
- **Reconcile.** When a deck's `deck.json` or its set of frames changes on disk by any hand (an agent, a teammate's save, an editor), the daemon, after the folder has been quiet for a moment, lays the page out and writes only the sidecars whose place differs: slides to their slots, any loose frame that is off a cell or shares one moved to the nearest free cell. Running it twice changes nothing, and two machines running it produce the same bytes. `deck.json`'s `version` names the layout rules; a daemon reconciles only a version it knows, so two spool versions can never fight over places. A change to the layout numbers is a new version.
- **Deck changes go through one daemon operation.** The window sends an intent (insert at, trade with, take out, reorder, set the talk's size, make a deck with starter slides) and the daemon applies it whole: `deck.json`, the sidecars, and for a trade the swap of the two frames' `notes.md`. It answers with what an undo needs, and the window records one undo entry. Rules, from the prototype's `talk.ts`: a trade puts the incoming frame in the slot and the outgoing frame in the cell the incoming one left, and swaps their notes; taking a slide out keeps its notes with it; several frames join in the order they had; setting the talk's size resizes every slide whose size was the old size and leaves frames of another shape alone.
- Renaming a frame rewrites its name in its page's `deck.json` in the same operation that already retargets walks; moving a frame to another page takes it out of the talk; trashing a slide removes it from the list and restoring puts it back loose. Duplicating a page copies its deck.
- The daemon serves one **deck read** per page: the size, the slides in order with each one's beats, whether it is live and its notes by beat, the loose frames, and problems (a missing frame, beats that are not a literal list, more notes than beats). It tells the window when any of that changes. A change to `deck.json` is a deck change, not a change to a frame of that name.

**Slides in code**

- `ui.beats(names)` takes a literal list of beat names and returns the current beat: its `name`, its `index`, and `reached(name)`, true once the talk is at or past that beat. It is reactive, as `ui.use()` is. A slide that never calls it has one beat. Where nothing is stepping it (the canvas, a still, ordinary play, the experiment off) it reads as the last beat.
- `ui.live()` marks the slide live: clicks reach it instead of advancing, and Tab can hand it the keyboard.
- The daemon reads beats and live from the frame's source without running it, as it reads walks and knobs, so the rail, Properties and the presenter view know a slide's beats before it has ever mounted. That is why the list must be a literal.
- Carry needs nothing new: the player already morphs elements that share a `view-transition-name` across a same-document swap and cross-fades the rest. Deck mode keeps every slide change a same-document swap so this holds.
- What the room must see of a live slide lives in `ui.state`. Decided for version one: the two windows share where the talk is and the slide's `ui.state`; state a component keeps to itself is not mirrored. The guide tells agents so. Turned down for now: replaying the presenter's input into the room, which double-applies against shared state, and streaming the room's pixels to the presenter, which only the Mac app could do.

**The stage: one engine, three hosts**

- Deck mode is a mode of the existing player: one render document composing only the talk's slides, with a session of `at` (slide and beat), the slide's shared state, a restart count per slide, and whether a live slide holds the keyboard. Stepping is a pure reducer: next plays the next beat, then the next slide's first beat; back steps beats, and across a slide boundary lands on the previous slide's last beat; skip moves by slide; Home, End and digits-then-Enter jump; restart replays the slide from its first beat with its state reset.
- The same stage is hosted in three places and behaves identically in each: in place on the canvas inside an entered slide, in the presenter view, and in the room's window.
- The stage is always the talk's size, scaled to fit its host both down and up, centred on black. A frame of another shape is fitted and centred inside it. The viewport never resizes between slides, so the player's cross-size path, which hides the document and shows the background, is never taken.
- **Keys**, the same in every host, from the prototype's `keys.ts`: next on → ↓ Space ↵ PageDown N, and a click on a slide that is not live; back on ← ↑ PageUp P ⌫; ⇧→ and ⇧← skip the beats; Home, End, digits then ↵; B or . blacks the room and any key brings it back, doing nothing else; F freezes the room; R restarts the slide; X swaps the screens; ? lists the keys; Tab hands the keyboard to a live slide and Esc takes it back; Esc otherwise goes up one step (out of the slide, or ends the talk). A focused text field keeps its keys. PageDown and PageUp always move the talk, even from a text field or while a slide has the keyboard, so clickers always work. Keys with a modifier, or that a slide prevented, are left alone. With nothing entered the canvas's own keys stand, plus ⌘↵ (present from the selected slide) and ⇧⌘↵ (from the first).
- Keys pressed inside the sandboxed slide reach the host over the player's private port from the frame runtime, which applies the text-field and handed-over rules where the focus is. The canvas's Alt-based relay is not reused.

**Never a flash, never an error**

These two are the reason the engine exists and are requirements with tests, not goals.

- **Ready before the key.** A slide is ready when showing its first beat needs nothing more from the network, the compiler or a decoder: its module evaluated, its styles in the document, the fonts those styles use loaded, its images decoded, and it has been rendered once out of sight. While the talk is on slide `i` the stage readies `i + 1`, then `i − 1`, then onward. A step to a ready slide commits in the next frame. A step to a slide that is not ready (a jump, or a key pressed too soon) holds the current picture until it is, never a blank or a spinner on the room's screen. Today's warming does not meet this: it evaluates modules only, and styles can still be fetched after the key is pressed. How readiness is reached is the builder's design; two candidates are a second hidden render document that mounts the next slide to fill the caches, and scoping each frame's styles so two can be active at once. The 1.5 seconds designers measured between `ui.go` and the next frame has no fixed wait behind it and needs a trace to attribute.
- **The room never sees an error.** Each slide is contained. A slide that fails to compile or import is known before it is reached, and the presenter view says so beside it. A slide that throws while mounting is not swapped in: the room keeps the slide it had. A slide that throws later keeps its last picture on the room's screen as a static copy. In all three the presenter view names the slide and the error, the next key still moves on, and nothing of spool's error drawing, boot overlay or broken-frame drawing can appear in the room's window. A canvas drawn by WebGL may not survive in a static copy; say so in the presenter view rather than pretend.
- **A saved change keeps the place.** When a slide's source changes while the stage is up, the stage takes the new build and stays on the same slide and beat.

**Presenting**

- Present turns spool's own window into the presenter view, as the design draws it (the chrome falls away around the selected slide, which travels to its place in the presenter view), and opens the room as a second window. Ending brings the canvas back with the current slide selected and closes the room.
- The presenter view is the one authority. It publishes numbered, absolute snapshots of the session; the room applies the newest and, on opening or reloading, asks for it. The room never steps by itself. Both run on the window's origin, so a broadcast channel between them is enough; nothing goes through the daemon. The pointer's place over a live slide travels separately and lightly, and the room draws it as the soft dot.
- Black and frozen are states of the room: black draws black; frozen stops applying snapshots, so the presenter can look ahead, and catches up when released. Their cues sit beside the room's name in the presenter view, never on a slide.
- The presenter view has, as drawn: the clock counting from the moment Present was pressed; the room's name with its cue and swap; the current slide live; the next beat (a slide that is not live shows what the next key plays; while a live slide has the keys this shows the room's view instead); the beat's name, count and notes; a bar per slide with a clickable segment per beat; freeze, black, restart and help.
- The room's window has no chrome and no cursor. In a browser it opens as a window and goes full screen on the first key or click in it, which is consumed. If the room is closed mid-talk the presenter view says so and offers it again.
- In the Mac app the room opens full screen on the other display when there is one, and X swaps the two; with one display it opens as an ordinary window. The Mac app already makes extra windows for play and already reads the displays.

**The deck page on the canvas**

- On a deck page the canvas's alignment guides, gap snapping and resize handles are off, and the deck's own snapping stands: a held frame follows the pointer and one outline shows the slot or cell it will land in. Drop zones on a slide, from the prototype: the left fifth inserts before, the right fifth after, the middle trades; past either end joins the end. A loose frame dropped on an occupied cell pushes the run of frames beside it along. The band lifts while a frame is held over it and runs past the last slide.
- A slide's name label carries its number before the name, and its play slot presents from that slide.
- Going in: double-click or Enter flies the camera in to fit the slide (the prototype's 600 ms and easing, room 40 above and 24 beside and below) and mounts the stage over the slide at the slide's last beat. The slide's own picture stays until the stage has drawn the same picture over it, so going in never blinks. Esc flies back: to the exact camera from before when the talk is still on the slide entered, and otherwise to the same zoom and height centred on the slide the talk ended on, which becomes the selection. ⌘ double-click still opens a slide's words through Edit, unchanged.
- Entering an ordinary frame on an ordinary page is untouched.
- Pages rail: a deck page has the deck icon and a present action; its rows are the talk in order, a hairline, the loose frames; rows drag across the hairline. Properties on a slide: the size section reads the talk's size as `all slides`; a `notes` section with one field per beat, named by the beat. On a loose frame the size is its own.
- New presentation, beside New page, makes a deck page with the five starter slides from the design (`spool-deck--new`), as real frames that use `ui.beats`, then focuses the Agent composer with the hint "What's the talk about?".

**For agents**

- A `deck` topic in `spool skill`, shown when the experiment is on: the files of a deck, the talk's size, `ui.beats` and `ui.live`, notes by beat, carry by view-transition name, slide text written as literal words so a hand can edit it, what the room sees of a live slide, and that spool places the frames.
- `spool check`, when the experiment is on: a `deck.json` that does not parse or names a frame that is not there; beats that are not a literal list of distinct names; a frame that imports its `notes.md`. As warnings: a slide whose size is neither the talk's nor deliberately its own shape, and more notes than beats.

## Testing Decisions

A good test here proves something a presenter or an agent relies on, once, at the cheapest level that shows it. The repo's rules in `AGENTS.md` apply: a function before a daemon, a daemon before a browser; extend a case before adding one; never test source text or class strings.

- **The deck's pure model**, as functions: reading and writing `deck.json` (forgiving reads, unknown keys kept, one name per line), the layout, every drop rule (insert, trade with its notes swap, take out, several at once, the pushed run in the grid), the reconcile plan (idempotent, same bytes from two orders of events), notes to beats, the key table to commands, and the session reducer (next and back across slide boundaries, skip, jump, restart, black, freeze and catch-up). Most of the rules live here, so most of the tests do. Prior art: the tests beside `order.ts`, `snap.ts` and `arrange.ts`.
- **The daemon**, over a fixture `design/`: the deck read; a deck change applied whole with its undo; reconcile after a file is written from outside, including that it writes nothing the second time and nothing for an unknown version; rename, move, trash, restore and duplicate keeping `deck.json` in step; beats and live read from source; everything absent with the experiment off. Prior art: the tests beside the geometry and explorer routes and `knob-literals`.
- **The stage, in a browser**, one suite built on a fixture deck that is deliberately hard: web fonts, a large image, a slide with a WebGL canvas, a live slide, a slide of another shape, a slide that throws on mount, one that throws on its second beat, and one that does not compile. It proves: every step to a ready slide reports that it was ready before the command arrived and commits within a frame; frames captured across the changes (the browser's screencast) contain no blank and no unstyled picture; a step to an unready slide holds the old picture; none of the three broken slides puts anything but a slide on the room's screen, and each is named in the presenter view; two windows stay on the same slide and beat through a long random walk of commands, a reload of the room, freeze and release; a saved change keeps slide and beat. Prior art: the player's browser tests.
- **The canvas flow, in a browser**, one walk: New presentation, drag a loose frame into the talk, trade, take one out, undo, write a note, go in, step, come out where it started.
- **The Mac app** is proven by a run on the m1 (below), not by a suite.

The feature is done when someone gives a whole talk from it: on the m1, in the Mac app, with a deck an agent wrote from the guide alone, through every key in the table, with the room on its own window, recorded with screenshots in the builder's report.

## Out of Scope

- Following a presenter by link and playing a deck on spool.page. The cloud viewer pins its own spool version and link viewers have no live channel; that is its own rollout on the map (#262).
- A layer that outlives slide changes, so a live object (WebGL, a running app) travels between slides. Flat elements carry between slides; a live object carries between beats inside one slide. Named as a later addition in #255.
- Mirroring a live slide beyond `ui.state`: replayed input, or the room streamed to the presenter.
- Easier pictures on slides (#216): a follow-up. (Exporting the talk, as a PDF and as one HTML file that plays, was out of scope when this was written and was added as #275.)
- Turning an existing page into a deck from the UI. An agent or a hand writes `deck.json`.
- Variants as a concept, thumbnails in Pages, a Notes pane holding the whole talk, a transition control, a laser pointer, a white screen, drawing on slides, the room answering on phones. All turned down in #255, with reasons.
- The extension core, the SDK and the new window (map #251). Nothing here waits for them and nothing here builds them.
- Changing what entering an ordinary frame does.
- Recording a talk as a film.

## Further Notes

- The team canvas is out of git. A fresh worktree gets `design/` with `pnpm -s dev open .`; a read-only copy to read the prototype's code from also sits in the main lane's project folder, which must never be edited or served from.
- Team sync has two open bugs about files lost from `shared/` (#243, #249). The deck adds automatic sidecar writes and a notes swap on a team project, which is why the ticket that writes to disk asks for a second review.
- One note on the map changes with this spec: places are written rather than computed. The map's line from #253 stands for the rebuilt core, where a page kind can own its layout.
- A changeset ships with this: a new experiment and two calls on the `spool` import are published behaviour.

## Comments

### agent, 2026-11-10T19:41:38.183Z

**From task 557, 2026-11-10:** #243 is fixed and on main (283bf00a), and the shared 7767 daemon runs it. The rule against fetching `design/` into a worktree is lifted for worktrees made from main at or after that commit (update first). This ticket's worker may run `pnpm -s dev open .` and play the design frames as its body says. Before a worktree holding a `design/` is removed by hand, run `pnpm -s dev remove <path>` first.
