# #255 · The deck's look and feel

- State: closed (resolved: deck-line)
- Labels: wayfinder:prototype
- Parent: #251
- Tasks: task 561 (Deck look and feel prototypes), task 563 (Deck look and feel design)
- Created: 2026-11-10T08:20:58.287Z
- Updated: 2026-11-10T16:08:24.795Z
- Closed: 2026-11-10T16:08:24.795Z

## Question

What does making and giving a presentation in spool look and feel like?

Worked with the loom skill: designers make takes as live frames on the team canvas, on `explore/deck`, and Liam picks there. Read the map's Notes first for what is settled (a deck is a kind of page on the same canvas, default spool is clean, the deck is an extension).

Each take shows the whole loop: a deck page on the canvas, the slide list, notes, Present for the audience, the presenter view, and stepping inside a live slide.

**Takes to bring.** One clean, lean take in the spirit of Figma Slides on today's chrome: slides in rows by order, a slide list running top to bottom in the left rail, entering a slide to work on it. And wildcards that rethink what a deck is, so we don't only copy what works. Liam: "presentations in the end is presenting to people, a public, and this could be kind of just live animations with checkpoints". Seeds, not a brief: a deck as one continuous live scene the presenter moves through checkpoint by checkpoint; a deck as a camera path across frames that stay where they sit on the canvas. Designers may bring their own.

**Hold to.** Everything is a live TSX frame, and a slide can hold a live prototype frame. Nice, clean and smooth. Lessons from earlier rounds (ticket #129 and its comments): a transition inspector was too much, the agent does the craft and the person points and says what they want; rebuilt shells lost side by side against today's chrome.

**Resolved when** Liam has picked on the canvas. The answer names the take and lists what it needs from the core (panes, properties sections, tools, layers, keys, what the player must do), as input for the slot list.

## Comments

### agent, 2026-11-10T09:01:31.254Z

Round 1 is on the team canvas, page `explore/deck` ([spool.page/devosurf/spool](https://spool.page/devosurf/spool)), from agent-hub task 561. Rows top to bottom, smallest diff first; across each row the states `--present`, `--presenter`, `--inside`. All 32 frames pass check and boot clean. The talk is Sola Ring's launch with the live Sova app on a slide; code in `design/shared/ui/explore/deck/<take>/`.

- `deck-rows`: Figma Slides rows on today's chrome; the whole talk's notes are one script in a Notes tab beside Properties; Present from a slide's name label or ⌘↵. Needs: a Notes pane, a present action on the name label, ⌘↵, a two-screen presenter mode in the player.
- `deck-in-place`: one slide at a time on the canvas with its notes typed under it, ↑↓ glide down the column; Present makes the chrome fall away around the slide where it sits. Needs: a notes layer under frames, one-slide camera stops, a present action on deck rows in Pages, a player mode that hides the window's chrome.
- `deck-shots`: a stop is a camera view the shape of the screen (one slide, a close-up, two frames side by side, the whole page); order and notes in a Shots pane read like a script. Needs: a Shots pane, a canvas layer for the shot box, "keep this view", a player that moves the camera over one page.
- `deck-thread`: a line drawn through frames where they sit is the route; drag a bead to reorder, pull it off to leave a frame out; the knot is Present. Needs: a canvas layer, a Properties "path" section, a camera player along a curve.
- `deck-reel`: one live scene; agent-marked checkpoints are pins on a timeline under the frame, scrub, click to play to one, drag to reorder. Needs: a canvas layer beside frames, a checkpoint API in the frame, a synced presenter window.
- `deck-scroll`: one tall page read top to bottom; a "room" window marks what the room sees, names in the left margin, notes in the right. Same needs as reel.
- `deck-script`: each slide's beats are lines of what Ada says; → plays the next beat; the presenter view is a teleprompter. Needs: a frame API naming beats so arrows step inside a frame, a Script pane with a split Present button.
- `deck-fork`: the room joins at a link on their phones, the deck forks at a question and the answers pick the next slide; inside a live slide every phone gets its own copy of the app. Needs: a Room pane, a public phone view per slide from spool.page, walks decided while presenting.

Designer notes on the medium: flows can't be walked on `spool url --raw` (CORS, state lost), only in the player; the player takes about 1.5 s to load the next frame after `ui.go`; `spool flows` reports `bar-end.tsx:53`, `share-control.tsx:154`, `tab-strip.tsx:609` as unreadable in every frame importing SpoolShell; `shot` sometimes catches WebGL before it draws; `CanvasChrome` has no slot for an extension's pane (shots built on `PaneWindow` directly).

Not picked yet. Liam then asked to carry this on with Fable 5.2 as the brain (task 561's thread holds his words).

### agent, 2026-11-10T10:16:36.901Z

Round 2 is on `explore/deck`, below round 1, from agent-hub task 563 (Fable as the brain). Liam on round 1: rows "was pretty clean, feels alot like spool"; "i dont really like the bloat in the left side like thumbnails"; and the open question, "in spool you should be able to make variations on slides etc, so like how would that even work, im thinking a free canvas but i dont know ... dont want to overengineer this either".

So round 2 is three takes on `deck-rows`' chrome answering how versions of a slide live in a deck. All hold to: a plain Pages list (names only), an audience screen that shows only the slide, beats inside a slide (→ plays the next beat, then the next slide; one notes paragraph per beat), the live slide used from the presenter view (clicks always reach it, ↵ hands it the keyboard, esc takes it back, the room sees a soft pointer dot). 12 frames, all pass check and shoot clean; motion not yet seen on a GPU.

- `deck-desk`: the row plays, versions hang under their slide; drag one up or press `use` and the two trade places; notes belong to the place. Needs: a deck layout (row plus columns, wrapped rows start below the longest column), a swap drop target, a notes section in Properties, deck icon and Present (⌘↵) on the page's row, the two-window player.
- `deck-free`: a free canvas; the order is the Pages list's; a frame in the talk carries its number on its name label, the rest are loose and sit under a hairline in Pages; `use as 3` moves the number, nothing on the canvas moves. Needs: no layout at all, a number and a verb on the name label, the hairline in Pages, a notes section in Properties, the same player.
- `deck-inline`: versions take a line of their own where the slide is in the talk, inside a faint outline; `keep` folds the rest into Trash (undo brings them back). Needs: a deck layout with an open slot, a `keep` verb, a Notes pane with the whole talk's script.

Shared frame-side needs, as input for the slot list: a call by which a slide names its beats and reads the current one, a way for a live slide to take keys while Ada is inside, and the player sending Ada's pointer to the room's screen.

### agent, 2026-11-10T11:19:55.035Z

Round 3 is on `explore/deck`, below round 2 (task 563): one take, `deck-line`, the brain's recommendation, which Liam asked to see drawn. Five frames (`deck-line`, `--present`, `--presenter`, `--inside`, `--new`), all pass check and shoot clean; driven in the player by the designer; motion not yet seen on a GPU.

The rule: the top line of the page is the talk, everything else on the page is a loose frame. It is `deck-desk`'s row with `deck-free`'s looseness: the line never wraps, so drafts under a slide push nothing around, and nothing stores "a version of slide 3" (position says it). Drag into the line to insert, onto a slide to trade places (the version takes the slot's notes), down to take out; a loose frame under a slide offers `use as 3`. Pages: the talk's rows, a hairline, the loose rows. Notes: a Properties section, one paragraph per beat. `--new`: New presentation under New page in the Pages menu gives five starter slides, with the Agent composer focused on "What's the talk about?".

What it needs from the core, as the designer listed it: a layout the extension owns for a page's top row (no gaps, no wrap) with numbered slot labels and drop rules (part to insert, trade preview, close on take-out); a divider inside a page's rows in Pages that rows drag across; a `notes` Properties section; a frame call declaring beats and whether the slide is live; keys ⌘↵, → ←, ↵ and esc; a shell mode where the window chrome falls away around one frame in place; a room window of its own with the pointer relayed to it; a New presentation item beside New page. Not picked yet.

### agent, 2026-11-10T13:49:01.485Z

`deck-line` grew after Liam's reaction ("yeah this is pretty clean"; then: still a canvas? double-click to go live? transitions where the ring follows? "pressing space can maybe go next and just arrow keys to go next and prev, like presentation controls rather than it being for canvas"; "consider these user experience keybinds and things you might be used to from before"). All five frames pass check and shoot clean; driven in the player headless, motion not yet seen on a GPU.

- **Still a canvas.** The page pans and zooms freely; the deck owns only the top line.
- **Going in.** Double-click or ↵ on a slide flies the camera in and the slide is live (`live · esc exits`); esc flies back.
- **One ladder of keys**, the same for an entered slide and for presenting, checked against PowerPoint's and Google Slides' documented keys: next beat then next slide → ↓ Space ↵ PageDown N (and a click on a slide that is not live); back ← ↑ PageUp P ⌫; ⇧→ ⇧← skip the beats; Home, End, digits then ↵; B or . blacks the room's screen, any key returns; ⌘↵ presents from the selected slide, ⇧⌘↵ from the first. On the canvas with nothing entered, spool's keys stand (Space pans, ⌫ deletes).
- **Changes a settled note on the map**: ↵ no longer steps inside a live slide, because ↵ is "next" in PowerPoint and Keynote. Clicks always reach a live slide, a focused text field keeps the keys, and ⇥ hands the whole keyboard to a slide that uses arrows itself; esc takes it back; PageDown and PageUp (clickers) always move the talk. Proposed by the brain, awaiting Liam's yes.
- **Carry.** An element two slides share travels as one object (the ring from `title` into `sense`, `finishes` into `order`); slides that share nothing dissolve. No transition control in the chrome; the agent writes it.

For #256 and #253: today's player morphs flat elements between frames with view transitions, but a live WebGL element is snapshotted (frozen, cross-faded) and each frame is its own document. The prototype's ring is one canvas that stays mounted on a stage above the slides; slides declare where they hold it (name, place, pose). So carrying a live object between slides needs a layer in the player that outlives slide changes, present in the canvas's entered view, the presenter's live slide and the room. Without it: flat elements carry between slides, live objects carry between beats inside one slide.

### agent, 2026-11-10T15:24:47.241Z

`deck-line` simplified with Liam over four more passes (task 563); all five frames pass check and shoot clean, each change driven once in the player headless.

- **The band.** One quiet surface behind the top row, full width, so it runs past the last slide; it lifts while a frame is held over it. On the band a frame plays, off it it does not. Liam: "shouldnt there be like a canvas or some background so you know that placing them on that row takes them into the presentation".
- **Variants are not a concept** (Liam: "should variants be a concept?", "so we dont overcomplicate things"). Turned down after being drawn: `use as N` on a loose frame's label, and drafts following their slide on reorder. Below the band every frame snaps into a grid cell and its place means nothing. Drag onto a slide trades the two (the frame takes the slot's notes, the slide goes to the cell the frame came from); drag between two slides inserts; drag down takes out.
- **Snapping** is the deck's own: a held frame follows the pointer and one outline shows the cell or slot it lands in. No alignment guides.
- **Size.** No resize handles on a deck page. The talk has one size, read as `all slides` in Properties, editing it resizes every slide; a loose frame's size is its own, in Properties; a frame of another shape in the talk is shown fitted and centred.
- **Play** on a slide's name label presents from that slide.
- **In a slide the talk plays in place**, as the room sees it; the camera does not travel between frames and nothing crosses the canvas. Turned down after being drawn: the camera gliding to the next frame with the shared object flying over the gap.
- **Words.** ⌘ double-click opens a slide's words through spool's existing Edit and write lane; plain double-click goes in. Nothing deck-specific. For the deck's agent instructions: slide text is written as literal words, or the gate refuses the edit.
- **Presenter keys** beside the list above: F freezes the room's screen, R restarts the slide, X swaps the screens, ? the key list. Black and frozen cues sit beside the room's name, never on the slide.

Awaiting Liam's pick.

### agent, 2026-11-10T16:08:24.795Z

## Resolved: `deck-line`

Liam picked it on the canvas on 2026-11-10 (task 563), after three rounds and thirteen takes. It is adopted into `app/` as `spool-deck`, `spool-deck--new`, `--present`, `--presenter`, `--inside` (code in `design/shared/ui/spool/deck/`, the demo talk in `design/shared/ui/demo/sola/`), listed under To build in `design/AGENTS.md`; `explore/deck` is deleted. Play the frames before specifying anything: they are the reference for feel.

### The take

A deck is a page whose top row plays. One quiet full-width band behind that row says so; everything else on the page is a loose frame in a grid, and where it sits means nothing.

- **Making.** Drag a frame onto a slide and the two trade places; between two slides and it joins; off the band and it leaves. The band runs past the last slide, which is where a frame joins the end. Reordering is dragging along the band. Skipping a slide is taking it off the band. The page still pans and zooms like any canvas, and multi-select (several frames dragged onto the band join in the order they had), duplicate, trash and undo are spool's own.
- **Snapping** is the deck's: a held frame follows the pointer and one outline shows the slot or cell it will land in. No alignment guides.
- **Size.** The talk has one size (`all slides` in Properties; editing it resizes every slide). No resize handles on a deck page. A frame of another shape that joins the talk keeps its size and is shown fitted and centred.
- **Pages list.** Plain names: the talk in order, a hairline, the loose frames. A deck page differs by one icon and one present action.
- **Notes** are a Properties section on a slide, one paragraph per beat. They belong to the place in the talk: a frame traded in takes them over.
- **Words.** ⌘ double-click opens a slide's words through spool's existing Edit and write lane. Nothing deck-specific.
- **Going in.** Double-click or ↵ on a slide flies in and the slide is live; from there the talk plays in place, exactly as the room will see it, so rehearsing is presenting without the second screen. Play on a slide's label, or ⌘↵, presents from that slide; ⇧⌘↵ from the first.
- **Beats and carry.** A slide names beats; → plays the next beat, then the next slide. An element two slides share travels as one object. Both are the agent's craft in the slide's code: no transition control anywhere.
- **The room's screen** shows the slide and nothing else, ever. **The presenter view** has the clock, the slide live, what the next → plays, this beat's notes, and a bar per slide with a segment per beat.
- **Live slides.** Clicks always reach a live slide and the room sees Ada's pointer as a soft dot over it. A focused text field keeps the keys. ⇥ hands the whole keyboard to a slide that uses arrows itself; esc takes it back.
- **Keys** (an entered slide and presenting share them): next → ↓ Space ↵ PageDown N and a click on a slide that is not live; back ← ↑ PageUp P ⌫; ⇧→ ⇧← skip beats; Home, End, digits then ↵; B or . blacks the room; F freezes the room; R restarts the slide; X swaps the screens; ? the key list (presenter only); esc goes back up one step. PageDown and PageUp always move the talk, so clickers work while a slide has the keys. With nothing entered, spool's canvas keys stand.
- **Starting.** New presentation, beside New page, gives a page with five starter slides already designed and the Agent composer focused on "What's the talk about?".

**This changes one settled note on the map**: ↵ does not step inside a live slide. ↵ is "next" in PowerPoint and Keynote, so it is next here; ⇥ hands over the keyboard. Proposed by the brain, drawn, and left standing by Liam.

### Turned down, with the reason

- Thumbnails, numbers and dots on the deck's rows in Pages (Liam: "i dont really like the bloat in the left side like thumbnails").
- Variants as a concept: `use as N` on a draft's label and drafts following their slide (Liam: "should variants be a concept?", "so we dont overcomplicate things"). Also `deck-inline`'s keep-one-trash-the-rest.
- A free canvas whose order lives only in the Pages list (`deck-free`): the talk can no longer be read off the canvas.
- A wrapping row with drafts in columns (`deck-desk`): drafts push the rows apart.
- Camera routes over frames that stay put (`shots`, `thread`), one scene on a timeline (`reel`, `scroll`): their good part survives as beats. The room answering on phones (`fork`): its own extension later.
- A Notes pane with the whole talk as one script: no new pane; can be added later without changing anything.
- The camera gliding between frames while a shared object flies over the canvas: the room never sees that, and it is the hard part to build.
- A laser pointer, a white screen, drawing on slides, a phone-shaped loose frame as a demo of the fit rule.

### What it needs from the core (input for #256 and the specs)

- **Page kind.** A page is a deck: its ordered frames are the talk, the rest are loose. Order is already kept apart from position (`canvas.json`); the deck needs "in the talk or not" per frame, and the talk's one size.
- **Canvas layout, owned by the extension for its page kind.** The top row laid out from the order (no gaps, no wrap), a grid for every other frame, and the drop rules (insert, trade, take out) replacing the canvas's own snapping and alignment guides on that page. Resize handles off for the page.
- **Canvas layer.** The band behind the top row, and the slot outline while dragging.
- **Name label.** A number before a slide's name, and the play slot presenting from that slide.
- **Pages list.** A divider inside a page's rows that rows can be dragged across; an icon and one action on the page's row; a New presentation item beside New page.
- **Properties sections.** `notes` (per beat) on a slide; the size section reading the talk's size on a slide.
- **Keys.** ⌘↵ and ⇧⌘↵ on the canvas; a key scope for an entered slide of a deck page that takes arrows, Space, ↵ and the letters above ahead of the canvas; the same scope in the player.
- **Frame calls** (the frame half, which travels with the project): a slide names its beats and reads the current one; a slide says it is live and whether it wants the arrows; a slide names an element it shares with its neighbours (name, place, pose).
- **Player.** A deck mode over the one controller (#253): beats before slides; two windows that move together from one authority, the room's with no chrome and no cursor; the pointer relayed to the room as a dot over a live slide; freeze and black as states of the room's window; restart of one slide; choosing and swapping the room's screen; the same mode drawn in place inside the canvas's entered frame.
- **A shell mode** in which the window's chrome falls away around one frame where it sits (Present's first moment).
- **A layer that outlives slide changes**, for carrying a live object (WebGL, a running app) between slides: today's view-transition morph snapshots it, so it freezes and cross-fades, and each frame is its own document. Without this layer flat elements carry between slides and a live object carries only between beats inside one slide. Recommended as a named later addition, not part of the first build.
- **Notes storage.** #253 says a sibling `notes.md`; the prototype's Properties reads `deck.json`. One of them, decided in the spec; per-beat paragraphs either way.

### Requirements the prototype cannot show

- **The next slide is loaded before → is pressed.** Designers measured about 1.5 s to load the next frame after `ui.go` in today's player; on stage that is a failure.
- **The room never sees an error.** A slide that throws keeps its last good picture on the room's screen; Ada sees the problem in the presenter view.
- **Motion has not been watched on a GPU by an agent.** Every pass was driven headless, where the WebGL ring renders in software. Liam played it on his Mac.
- **Agent instructions for decks**: slide text is written as literal words (or spool's write lane refuses a hand edit); beats and shared elements are declared through the frame calls; a prototype belongs on a slide the agent writes around it.

### Gaps against PowerPoint, outside this ticket

Sending the slides to someone (PDF export; a link that plays on spool.page, which #253 makes a separate rollout), and getting pictures onto slides easily (#216). Both would be complained about first.
