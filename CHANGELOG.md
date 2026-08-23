# Changelog

## 0.9.1

### Patch Changes

- 513fe14: The Mac app's first release build failed on the release machine, so the DMG never reached the 0.9.0 release page. It builds there now. Nothing in the npm package changed.

## 0.9.0

### Minor Changes

- a13eda3: Running `spool` with no arguments now opens your canvas in the browser, as well as printing its address. It only does that when you run it yourself in a terminal, so an agent or a script that runs `spool` still gets the address and nothing more. Pass `--no-open` when you want the address without the browser.
- aed42dd: Opening a project no longer shows an empty canvas while it loads. The field draws one cell per frame, so you can see how big the project is before its frames arrive. A fast open still shows nothing at all, because there is nothing to wait for.
- 50601e6: The daemon now keeps history for your canvas. When `design/` has been quiet for 45 seconds, everything that changed since the last save lands as one commit on the branch you are on, so a layout you liked an hour ago is always recoverable and the checkout is never dirty from canvas work. Frame arrangements count, so a frame you dragged is saved too.

  Saves only ever touch `design/`. Anything you had staged elsewhere is left exactly as you staged it, and spool never pushes. It waits instead of committing while a merge or rebase is in flight, while HEAD is detached, or while another git command holds the index, and it picks the batch up in the next window. A project that is not in a git repository says so once and stays silent after that.

- 095c7b5: The agent rail is now an experiment, and it is off. The canvas opens with the pages rail and your frames, and nothing where the agent used to be. To have it back, add `"experiments": ["agent-panel"]` to `~/.spool/config.json`, beside `updateCheck`, and restart the daemon. The field is a list of names, one per experimental surface, and a name this version of spool does not know is ignored rather than refused, so a config written for a newer spool still boots on an older one.
- 8bb52b8: History is now switchable, and on for new projects. `spool init` writes `"history": true` into `design/canvas.json` and prints one line saying so; `spool init --no-history` starts a project without it. A project that predates this keeps history off until the key is added, so upgrading spool never changes what your repo does. Set `"history": false` in `~/.spool/config.json` to turn history off on your machine whatever a project asks for. With history off, the daemon never watches or commits `design/` for that project.
- 15c49e3: Spool now has a Mac app. Download the DMG from the release page, drag it to Applications, and click Open Canvas in the menu bar. It brings its own Node and its own copy of spool, so nothing else has to be installed to get a canvas open.

  It starts the daemon, or adopts the one you already have running, so the CLI keeps working against exactly the same daemon. Quitting the app stops a daemon it started and leaves one it adopted alone. If you use the app you do not also need `spool autostart`.

- 4bcc642: Rows in the pages rail no longer write out the frame's file name. The name gets the whole row, and hovering a frame shows a menu button with the same verbs right-click has always offered. A terminal frame now says so with its icon.

### Patch Changes

- 66597ff: `spool skill` now teaches history, so an agent reading the contract knows the daemon commits `design/` for you and never commits or stages it itself. It names both switches: the project flag in `design/canvas.json` and `"history": false` in `~/.spool/config.json`.
- 5a4d059: Design saves now name what they saved. A history commit reads `design: 2 new, 3 frames, 1 moved` instead of a bare `design: save`, counted by frame, and a frame that only moved on the canvas says moved rather than changed.
- 07752c6: Stop a health probe that times out from deleting a live daemon's credential. `statusDaemon` and `stopDaemon` swept `daemon.json` by re-reading it, so state a successor wrote during the one-second probe — the window an upgrade's restart lands in — was deleted as if it were stale, stranding a healthy daemon that no verb could reach and no successor could bind beside. The sweep now clears only the state the probe itself read.

  `spool stop --force` stops a daemon holding the address that no state file accounts for, the way back from an install already in that state — the control token dies with `daemon.json` and cannot be written back by hand. `serve` and the auto-start path now name that daemon and point at the flag instead of asking for a file nobody can restore.

  A daemon reached through a forwarded port — an ssh tunnel to another machine — is no longer reported stopped when it is not: its pid names a process that does not exist here, and `stop --force` says so.

## 0.8.0

### Minor Changes

- bfc9419: A frame that does not state a size now starts at 1440×900 instead of 390×844. Most frames are pages, and a phone is a shape you pick on purpose: write `{ "w": 390, "h": 844 }` in frame.json for one. Frames whose size is already on disk are untouched, and `spool shot` narrates the new default when it falls back to it.
- 465a45b: The canvas now marks the frames you have not looked at. A frame spool has no record for wears a small white disc beside its name; one whose own folder has moved since you last looked wears a ring. The same marks appear in the pages rail, where a shut page says only that something inside it is unseen, and in the finder, which counts them and never clears them — a name in a list is not a frame.

  A mark clears by being read rather than by being clicked: the frame has to hold at least half the viewport in one direction, wholly enough to see, for the best part of a second, and the canvas has to have somebody at it. Pressing a frame clears it too. The record lives in `design/.spool/seen.json`, which is app-owned and gitignored, so it is yours and never travels with the project — and the first read of a project seeds it whole, because you cannot be behind on frames that existed before spool started counting.

### Patch Changes

- 51f02c4: `spool shot` now writes a frame much taller than a screen as numbered slices, `<frame>.1.png` through `<frame>.N.png`, printing one path per line. One screenshot of a long page spends its whole area on height, and whatever reads it downscales the text into mush; each slice stays near what a vision model actually keeps, with a small overlap so no line is halved by a cut. Device scale follows the frame the same way: 2× for narrow frames, tapering above 800px wide instead of capturing pixels the reader was always going to throw away. A rerun that writes fewer files removes the slices it no longer names.
- 6cb0087: Resizing a frame now retakes its picture. The thumbnail you see when you zoom back out is the frame at the size it is, instead of the size it happened to be when it was first photographed. This holds however the size changed: your own drag, an undo, or an agent writing frame.json after the frame already appeared.
- 0c56ba4: The shut pages rail is now just the edge that opens it. It used to carry a strip of folder icons, one per page, which was a second navigator that disagreed with the first: it listed every page at whatever depth, so a project with a folded tree showed more folders shut than open, and the icons said nothing about which folder was which without hovering each one. Opening the rail is how you look through the pages, so the strip no longer offers a worse way to do it.
- e8e60ff: A frame's still now draws at the shape it was photographed, never stretched to the box it stands in. Resizing a frame gives it a new footprint seconds before the fresh capture lands, and through those seconds — the drag included — the old picture used to smear across the new size. It now sits contained in the frame's corner over the placeholder surface, an honest picture of what the frame was until the new one arrives; a still whose shape matches its frame fills it edge to edge exactly as before.
- b40e8eb: A drag through the pages rail now opens only the folder it rests on. A shut page used to open the instant a drag arrived at it, so carrying a folder to the bottom of a long tree unfolded every folder on the way and moved the gap being aimed at out from under the pointer. Resting on one for 450ms opens it, an arc around its chevron counts the rest out, and a folder merely crossed is left exactly as it was.
- f9f3148: Every panel that scrolls now draws the same grey capsule: a rounded thumb inset from the edge, lighter under the pointer. The pages rail and the agent's transcript used to draw a two-pixel line in the accent colour, which spent the one accent on screen on a control nobody was looking at and gave a pointer nothing wide enough to grab.
- 4fbe15e: Project tabs drag sideways into the order you want, the way a browser's do: the tab follows the pointer, the others step aside for it, and the arrangement is written to the machine session so it survives a reload. `PUT /api/session/order` is how a page says it, and it opens and closes nothing — a tab the list never names stays exactly where it is.
- 475c723: Picking a page in the rail switches the canvas to it and leaves the tree exactly as it was. It used to unfold the folder as well, so every press dropped the rest of the list down the screen and there was no way to stand on a folder without opening it. The chevron is now the only thing that folds a page, in both directions, and → is its keyboard equivalent.
- c846fa2: The agent's hand now stands at a frame only while a call is open on it. It used to stand at the last frame any row in the conversation had named, which meant two wrong things: pressing send in a thread that had worked a frame put a hand on it before the agent had read a byte, and one read in the first second of a turn held the frame through the rest of it however long the agent then spent thinking or talking. A call ending leaves the hand where it was for four seconds, so a run of calls reads as one piece of work rather than as a thread that blinks. The number is measured rather than chosen: in a real capture, gaps inside a run run 1.3s to 3.2s and gaps between runs are seventeen seconds and up. The turn ending takes the hand off on the instant, because that is not a gap.

## 0.7.0

### Minor Changes

- 885c191: An agent can now state a frame's size without stating where it goes. Write `{ "w": 1440, "h": 900 }` into `frame.json` and the frame arrives that size, in clear space beside the other frames on its page, and spool fills in the position. Before this, a size on its own was ignored: the frame came out 390×844 with nothing said about it, so the only way to get a size was to make up coordinates too, and the guess landed on top of another frame.
- a6c384a: Running `spool` with nothing after it takes you to your canvas. It finds the project you are standing in, registers it, starts the daemon if one is not already running, and prints the canvas address. Before, a bare `spool` printed the list of commands, and reaching a visible canvas took `spool open`, then `spool serve`, then retyping a URL you had to remember.

  Nothing else moved. `spool open` still registers a project without starting anything, a bare `spool` outside a project still points you at `spool init` rather than scaffolding one, and a misspelled verb is still an unknown command rather than a canvas.

- 6577d70: The pages rail behaves like a real file explorer.

  Going into a page now opens it: clicking a page's name, or arrowing onto its row, switches the canvas to that page and expands it. The chevron is the other direction and still only expands, without going anywhere. Dragging a frame across the tree opens each shut page it arrives at, with no wait, and closes it again behind you unless you dropped something inside, so passing over a folder no longer leaves it open.

  Two new verbs on a frame's menu. "New page with selection" makes a page inside the one the frames are on and moves them into it, and one press of undo takes both halves back. "Move to page" opens a list of pages you can type at, which is how you move a frame or a page somewhere too far away to drag to. "Collapse all" is a button in the rail's header now, so you can reach it when the tree is too full to leave any empty space to right-click, and holding option while clicking a chevron folds just that page and what is inside it rather than the whole tree.

  Three things that were wrong are right. Shift-clicking two rows selects the rows between them in the order the rail is drawing rather than in alphabetical order. Shift with an arrow key extends the selection instead of quietly nudging the frames on the canvas by ten pixels. And a name a frame or a page already answers to is refused the moment you commit it, without a trip to the daemon first.

### Patch Changes

- 259d9a0: A cli and a daemon on different versions now say so, on whichever verb breaks. Running `spool shot` against a daemon built from another version failed with only `spool: unauthenticated`, which reads as a credentials problem and sends you looking at the wrong thing. `spool status` already knew the real story and said it, but the verb that actually broke did not. It now adds the same sentence: which version the cli is, and how to bring the two back in step. A genuine authentication failure against a matching daemon is unchanged.
- 260accb: Typing `localhost:7766` now opens spool. It used to answer "unexpected host" because the daemon only recognized the name it was bound under, so the other name for your own machine was turned away. It sends you to the bound address instead. A name that is not this machine is still refused.

  The update toast now tells you how the update is going and always ends. Pressing Update used to say "Updating…" and could sit there forever: an upgraded daemon issues a new key, and an open canvas had no way to be given it, so the page never came back and never said why. It now reloads onto the new version by itself, says whether it is installing or restarting while it waits, and says so plainly when an update did not land instead of leaving you guessing. A canvas left open through any daemon restart now comes back the same way, rather than looking fine while nothing reaches it.

- 659a34c: Spool only offers an update when it can actually install one. Running from a git checkout, or any install no package manager owns, no longer shows the update toast and no longer asks npm daily whether a newer release exists. The Update button there could only ever fail, because that kind of install updates with `git pull`.
- a9e7dcd: A frame folder holding both `frame.tsx` and `term.tsx` now names the folder it actually is. When the frame lives inside a page, the error used to point at `design/frames/<name>`, a flat folder that does not exist, so the one message telling you to remove an entry sent you looking in the wrong place.
- fd2a486: Zooming into a frame no longer replays its arrival. When a frame gets big enough to read, spool now holds its picture until the real document has finished arriving: fonts loaded, entry animations played out, nothing still moving. What you see is the picture, then the frame it is a picture of.

  Before this, the picture came away the instant the document reported loaded, which is halfway through its arrival. A frame that fades its content in was caught at the start of that fade, and a frame that draws to a canvas had not drawn anything yet, so a settled picture was replaced by black or by a replayed entrance and then settled a second time.

  The wait is bounded, so a frame that animates forever or never stops changing still appears after about a second. Going into a frame is unchanged: you asked to be inside it, and watching the entrance play is part of that.

## 0.6.0

### Minor Changes

- 0a59a5d: One undo stack for the canvas and the rail. `⌘Z` (`ctrl+Z` elsewhere) now walks back through everything you did, in the order you did it, and `⌘⇧Z` walks forward again.

  It used to be geometry only. Renaming a frame or a page, dragging a row to a new place, dragging a frame onto another page, duplicating, pasting and making a page all take an undo slot now, mixed in with moving and resizing frames on the canvas. Undo a duplicate or a new page and the copy goes to the Trash with the usual toast, because there is nothing else to put it back to.

  Deleting is unchanged. The toast still answers the first `⌘Z` after a delete, and once it drains the OS Trash owns what comes back.

  If something changed on disk while you were away, the entry that talked about it is skipped and the press does the next real thing instead of nothing. The stack lives in the window and starts empty after a reload.

- 5db3394: Pages hold pages now, to any depth. A page is a folder under `design/frames/`, so a page inside a page is a folder inside a folder. `explorations/chat` is a page, `explorations` is the page holding it, and both are ordinary pages with their own canvas.

  In the rail, drag a page onto another to nest it. Drag it back out to return it to the top level. Rows step in one level at a time, and each page opens and shuts on its own. Resting on a shut page opens it. Some gaps are ambiguous: the one under the last frame of a nested page could mean three different places. Move the pointer sideways to pick which. A page can never be dropped inside itself.

  Every explorer verb works at any depth: rename, duplicate, move, new page, and delete to the Trash. Moving or renaming a page takes everything under it. The frames inside it, the pages inside those, their cameras and their arrangement all arrive with the folder.

  A frame's name is still identity across the whole project. A page's name only has to be free among the pages beside it, so `explorations/chat` and `site/chat` are two pages rather than a collision.

  Flat projects are untouched. Nothing migrates, `canvas.json` keeps the shape it had, and a project with no depth in it behaves exactly as it did.

- f7d2fae: The pages rail is a file explorer. A page is a folder and a frame is a folder with one entry file, so the rail can now do what a folder tree does.

  Drag rows to arrange them, and drag a frame onto a page to move it there. Rename in place with Enter, F2, a double-click on a page name, or the menu. Duplicate with `⌘D` (`ctrl+D` elsewhere), copy and paste frames with `⌘C` and `⌘V`, and press `⌫` to move a frame or a whole page to the Trash, with the same undo toast the canvas has. Right-click any row for the verbs it has, and the `+` in the header makes a page that starts out being named. Arrow keys walk the rows and typing a name jumps to it.

  The order you arrange rows in is saved in `design/canvas.json`, so it survives a reload and travels with the repo. It never moves anything on the canvas. Frames an agent writes while you are away land where they belong: a new variant appears under the frame it is a take on, and everything else at its alphabetical spot.

  Renaming and moving are folder operations. Spool still never writes frame source, so a link that names a frame you renamed reads as missing until an agent fixes the name in the code.

- 18a64d0: Play opens a browser tab again, and the played page is a real page.

  `p`, `shift+enter`, the play control on a frame's label and "Play from here" all open the frame in a new tab. The inline flight, the floating pill and the canvas's play state are gone, so zooming on the canvas is navigation again and nothing more.

  A played frame is now a document the browser owns rather than a scaled picture. The page lays out at the real viewport width, capped at the frame's authored width: 1440 means 1440 and never more, and a 390 frame is a phone-width column centred on the page's background. Below the cap the frame's own CSS is in charge. Breakpoints fire, padding compresses, columns stack, and a frame that makes no accommodation overflows sideways exactly as that site would in production. Height is unconstrained: the page is as tall as its content and the browser scrolls it. Nothing is scaled to rescue a layout, because the rescue lies to the CSS.

  Chrome is nothing, by default. The tab title carries the frame and the project, and closing the tab is the exit everyone already knows. Rest the cursor against the top edge of the window for a moment and a bar peels in with back to canvas, a frame switcher and close. A small nub at the edge is its resting trace. Passing through on the way to the browser's own chrome never reveals it, and moving back down into the page hides it at once. On touch there is no chrome at all.

  The URL follows the walk. Every screen you land on names itself in the address bar, browser back and forward walk the session, a refresh reopens where you left off, and any moment is a link you can copy and send.

  Restart and fullscreen lose their buttons. The session is the page, so reloading the tab restarts it and re-reads the scenario, and the browser's own fullscreen fills the screen.

- 511362f: The rail's `root` row is gone. The root page is the `frames/` folder itself rather than a folder inside it, so the list is the root: frames at the top level draw as loose rows beside the page rows, and a flat project's rail is just its frames with no folder wrapped around them.

  Those loose rows are ordinary rows. Reorder them, drag one into a page, and drag a frame out of a page onto the top level to put it back on the root page. Every page draws its frames first and then its pages, so the root page's frames sit above the top-level page rows. Clicking a root frame takes the canvas to the root page, exactly as clicking any frame row takes it to that frame's page.

  Root frames answer every verb the rows beside them answer: rename, duplicate, copy, and Move to Trash. The collapsed strip lists the pages, and no page row lights while the root page is the one on the canvas.

### Patch Changes

- 9b0f5d5: While an agent worked, the mark the canvas drew for a write could run far past the frame it belonged to: rewriting a whole file drew a lane the height of the whole document, and an edit below the fold drew one that started off the bottom edge. A mark is now clipped to the frame it is about, so it never claims more than the frame shows, and a write that landed entirely out of view draws nothing.
- 18a64d0: Moving frames on the canvas while a play tab is mid-walk no longer leaves that tab stuck on a blank screen. The player holds the screen back until the frame is laid out at its new size, and it was waiting for a report about one particular move. A second move landing a moment later retired that report before it arrived, so nothing ever released the screen and the tab had to be reloaded.
- e558445: A phone-shaped frame stayed a still picture at the zoom you actually read one at. The canvas decided a frame was drawn big enough to run only from its width, so a 390 by 844 frame needed 103% zoom before it booted, while a wide frame of the same area had been running for a while. It now goes by the frame's longer drawn edge, so portrait frames come alive at sensible zooms. Wide frames are unchanged.
- b4bf1f8: An agent that places a frame by writing its `frame.json` now moves it on an open canvas. The daemon used to drop sidecar writes entirely, so the frame stayed where it was until you reloaded, and only a drag in the browser ever moved anything. The canvas still never reloads a frame's document for a sidecar write, and your own drag is not echoed back at you mid-gesture.

## 0.5.2

### Patch Changes

- ffa6c45: The skill no longer promises a session that a bare frame document cannot keep. `spool skill flows` now scopes session continuity to the canvas and the player, and `spool skill verbs` says what `spool url --raw` is for and what it costs. The raw document is sandboxed onto its own origin, so it has no storage: a reload starts over, a walk out of it starts the next frame from the scenario with the state left behind, and a walk to a name no frame answers lands on the daemon's 404 instead of staying put. It also names the CORS error every raw walk logs, so nobody reads that as a dropped walk again. Drive the player for anything that walks or carries state.
- 861a6c6: `spool skill flows` and the scaffolded `shared/transitions.css` now name the selector that actually styles one walk direction or one `data-transition` apart. A swap's direction and type ride it as View Transitions types rather than attributes on the root, so the rule has to be keyed on `:active-view-transition-type()`; plain `::view-transition-*` rules match every swap alike.

## 0.5.1

### Patch Changes

- bbbd41f: An upgrade that cannot hand the new launch agent to launchd now puts the old one back and starts it again, so start-on-login survives a failed upgrade. If putting it back also fails, spool says autostart is off and tells you to run `spool autostart`.
- 9ebcee8: An empty project kept its rails to itself: with no frames and no pages, the canvas replaced the whole row with "No frames yet.", so the agent rail that writes the first frame was not there to ask. The notice now sits over the canvas surface with the pages tree on one side and the agent rail on the other. The tools still wait for the first frame, because there is nothing yet to select, pan to or arrange.
- 06899c8: A frame that writes the clipboard with `navigator.clipboard.writeText` — most shared copy buttons do — was blocked on the canvas and in the player, with "the Clipboard API has been blocked because of a permissions policy" in the frame's console, while the same frame opened on its own could write. Both surfaces now delegate clipboard writes to the frame they embed, so a frame keeps the clipboard it would have had. `ui.copy` is unchanged and still the way to copy through the canvas or player; clipboard reads remain unavailable.
- 495f603: Asking for a frame that is not on the canvas no longer points at a folder path that frames inside a page never use. The refusal now says the frame is not there and where a frame comes from.
- 5e5dce1: A `ui.state` write from inside a component body used to fail in silence: the write makes React run that render again, so the value the render just read was gone. The one that cost real time was a one-shot flag handed over by a walk, read and cleared in the same render, which left the next frame looking like it had arrived fresh. The runtime now warns in the frame's console when a render replaces or deletes a state key, once per site, naming the key and where it happened. Seeding a key that was not there yet (`ui.state.items ??= []`) stays quiet, because it is idempotent. The `spool skill flows` topic says the rule: writes belong in handlers and effects, and a one-shot flag is read in render and cleared in an effect.
- a909258: The `spool skill verbs` Playwright recipe now works on a player URL: it reaches frame content through the player's iframe instead of a top-level selector that could never match, and it says to open the browser at least as large as the frame so screenshots are not scaled down.

## 0.5.0

### Minor Changes

- 31ee106: You can see the agent is working without reading anything. A stroke is laid out of the left end of the composer's top border, carries along it, and is taken up into the right end, once every 1.6 seconds. It is the line that was already there, so the transcript gives up no room for it, and there is no word beside it.

  It says two things apart. At rest the border is the border, unchanged. A request out, a thought, words arriving and a tool call running all draw the same laying and taking up, because the answer to whether you need to do anything is no in all four.

  What it does say is how long. The stroke grows more present the longer one silence runs, from the weight it has always had up to full at thirty seconds, and back to resting the moment anything lands. It never slows down and it never changes colour: a long stretch of quiet is the agent thinking hard, so the line leans in rather than fading out, and the count in the log beside it is where the actual number is.

  The one state that does need you gets its own shape: while the turn waits on an answer the stroke stops where it was and an 18px break opens in the line. Nothing about it can be read as progress. It reaches 41% of the border at its longest and then shortens for the rest of the cycle, so no state of it is full, and it is nothing at all at both ends of its loop, which is where it starts over.

  If you have asked your system for reduced motion, the stroke is held still a third of the way along instead. It is the same picture, stopped.

- 51f2bea: The agent can ask you something, in the rail, instead of being stuck in a window nobody is looking at.

  Work under `design/` still never asks. Anything outside it asks once, and the request arrives with the agent's own written sentence about what it wants to do, under the line that says which call it is: allow it, allow it for the rest of this thread, or deny it. An always uses the rule the agent suggested for itself and is written to no file, because the complaint is repetition and not a missing permanent grant. Where it suggested no rule there is no always to press.

  The agent's own questions land in the log too, with their options and the whole of what each one costs, which is the part that is unreadable anywhere smaller. Press one, or ignore them and type your own answer in the composer, which stays live beside them and is the reply the agent is told to read most carefully. A question stops the turn until you answer, and the clock stops with it, so the seconds you spend deciding are not counted against the work. Nothing spool runs ever answers for you or times you out. The dismiss under the options is one word and sends a bare no, which lands the agent on an instruction to stop and wait.

  Typing never allows anything. Words are an answer to a question, so an approval takes one of its three presses and nothing else.

  If a connector asks a question of its own, spool says no on your behalf rather than showing you a form built by somebody else's server.

- e3cfb2e: You can see what the agent is doing to a frame. Before, the canvas said nothing: a frame's picture swapped for a new one some seconds after a write landed, and that was all.

  Now the frame the agent is working has a small square at its left edge and a line running from it. The line is as tall as the frame while the agent is reading the frame, and short while it is writing to it. It goes taut while a call is running and slack between calls, and every write that lands plucks it. While the agent takes a screenshot the line goes and four corner marks are drawn around the frame instead.

  A write also marks what it changed. The block that changed is tinted for under a second, and a short mark stands outside the frame at that height for six seconds, so you can still read the shape of a run of edits after the last one. If the agent edits a component two frames use, both frames get marked.

  None of it uses words. The rail is right there and already says which call is running and which frame it names.

  Two things it does not do. The camera stays where you put it: pressing the frame name in the rail is still how you go to a frame. And a frame drawn too small to run keeps the line and the corners but gets no mark on any block, because there is nothing on screen to measure.

- 218da52: The agent's words render the markdown the agent actually writes, instead of leaving half of its syntax sitting in the sentence.

  Emphasis, struck text and links draw. A link is its own words, underlined, and it opens in the browser, because a frame is reached by its own row and a URL in prose is the web. A sub-list sits under its parent rather than beside it, a list item that wraps stays one item instead of dropping its second line into a paragraph of its own, a three-line quote is one quote rather than three, a task box is a box rather than two literal brackets, and three dashes are a rule.

  The subset was measured over the captures this repo happens to hold, which proved those turns wrote no italic and no links rather than that the model does not. What is still deliberately out is a table and a heading: neither has a drawing yet that survives a column between 200 and 480 pixels wide, and a wrong one is worse than legible source.

  Nothing arrives out of order while it streams. A link's brackets and a task box's `[ ]` are characters the closing syntax deletes, so both wait exactly as a nascent list marker already waited for its space, and every prefix of every captured message still draws a prefix of what that message finishes as.

- f67a2ff: The two ways there is no agent to talk to are ordinary states of the rail now, and one of them has a way out.

  A machine with no `claude` on it gets a wall where the transcript goes, before you type anything. Spool runs the agent you already have, and there is nothing here to run yet. The composer stays and is switched off, so the rail still shows what it is for, and the docs link is the one the agent publishes itself. `check again` may come back with the same answer as often as it likes, because installing an agent takes minutes, and each press leaves one quiet line saying it looked. Nothing is coloured and nothing is called an error. You have not installed something yet.

  Being signed out is found out the only honest way, which is by sending. Spool reads none of the agent's own credential or config files to guess at it. So the words go out, land in the log in your voice the instant you press Enter, and the refusal arrives when the first reply would have. What the log shows is the agent's own wording, quoted exactly, with one sentence of spool's under it. Its own remedy is a slash command inside a session spool does not open, so spool names the terminal and hands its command back. Under that, once, the promise: spool uses that login and never asks for a key.

  Your prompt is not thrown away. A `signed out` strip sits above the log while it is true, and `check again` asks the agent whose login it is. When it answers, spool says whose, once, at the moment it starts using it, and then runs the sentence you already wrote. No second copy of it goes in the log. When it answers that nothing has changed, it says that instead and sends nothing.

  There is no API-key state anywhere, and no field to paste a key into. Spool asks for nothing and stores nothing, and an agent you configured with your own key breaks none of that.

- 2dd5eb9: You can change which machine is working from where you are typing, and find out when you are near a usage limit in the same place.

  The composer's footer says which model is answering and how hard it is thinking, and it is a button now. The menu it opens is not a list spool ships. It asks your own installed agent what it offers, every time, so a model that appeared because you upgraded your CLI is simply there and one that was retired is simply gone. Each row carries the name and the sentence your agent wrote for it, and each model brings its own effort levels. A model that supports none has no effort control at all rather than a greyed one. The rows are names, one line each, and a single line at the bottom describes whatever the cursor is on.

  Choosing one sends the same message that typing `/model sonnet` sends. The row and the footer move the moment you press, because asking your agent costs about a second and a menu that sat still for it would read as broken; the reply then settles what is really answering, so a change your agent refused puts the line back rather than leaving a machine on screen that was never picked up. Pressing a model that has no effort levels drops the level from the line straight away rather than showing one it does not have. The choice belongs to the thread, so one conversation can run on Opus while another runs on Haiku, and switching between them shows what each is actually using. An effort level held by an exported `CLAUDE_CODE_EFFORT_LEVEL` says so and stays where it is, because the environment outranks anything spool draws. The name in the footer truncates with an ellipsis at narrow rail widths and is never shortened: two of the offered rows resolve to the same model with only a parenthetical between them, so a trimmed name would be the correct name of a different machine.

  The usage window moved into that menu. It says which limit, how much of it is gone and when it comes back, whole at every rail width. In the footer the reset time was being clipped away, which is half of what the readout is for. It is absent until your agent warns, because below that there is no number to draw, and nothing is said about overage. When a limit is reached mid-turn the log says the work is winding down, which is why the agent finishes what it is holding and starts nothing new.

  The footer holds the model and the stop and nothing else. The `enter to send` hint is gone from it, because which machine is answering matters more than a keyboard hint you learn once.

- 41c8208: The agent is on the canvas. The right rail is a chat now: type what to change, press Enter, and your own Claude Code answers there instead of in another terminal. Your words land in the log the instant you send them. The wait before the first reply shows as a turning mark with a clock on it, so a second of nothing reads as work rather than as a hang. A thought the agent has on the way settles into one quiet line with how long it took. The reply arrives as it is written, at the rate it is written, with its bold, lists, code and fenced blocks drawn rather than left as markdown source. A long reply pins its own first line so the answer does not scroll away before you have read it. The frame the agent writes repaints on the canvas while the message explaining it is still landing. The rail opens at 420px, still drags from 200 to 480, and shuts to its own narrow strip. One turn at a time: while one is running, Enter is refused and the composer says so.
- bc482ad: A row in the agent rail is something you can open and follow. Click a frame's name in a tool line and the canvas goes there: the page follows, the frame lands in the middle and selected, and your zoom is left alone. Hover the name instead and the frame lights up out on the canvas. When it is on another page, that page lights in the Pages rail, because a row can only ring a frame that is on screen. A name for a frame the project no longer has reads struck through and does nothing. A run's count sits outside the target, so `edit home ×6` takes you to `home` and the rest of the row still opens the path.

  The agent's plan leaves the log for a one-line strip above it, carrying a count and the agent's own wording for whatever is running. A plan is written in nine seconds and then updated for the next nine minutes, so a transcript carries it off the top long before the ticks land. On the strip they land in front of you. Press it for the list. It is absent until a turn writes one.

  A screenshot the agent took is a real thumbnail behind that row's disclosure, which opens itself when the picture comes back. Press the picture and it fills the window at life size until you press esc.

  A sub-agent is one row that expands into its own transcript, so a fan-out of three designers is three lines until you want more. Every row in there names its frame and navigates like any other, because for a sub-agent the place is the canvas.

- acd5838: A turn is a readable log now. Every tool call the agent makes is one line in the rail, in spool's own words: `read cart`, `edit home ×6`, `shot receipt`, `ask Notion`. The line names the frame or the page it touched, never the file. The path, the command or the connector's wire name sits behind a disclosure that starts closed and that nobody has to open.

  A call appears the moment the agent starts writing it, and its subject arrives when the wire finishes sending it. So a nine-minute turn reads as work happening rather than as rows appearing whole. Six edits in a row to one frame are one line with a count that climbs while it happens, and the next thing the log draws ends the run.

  A call that finished draws a check. One that ran and failed draws a cross. One you stopped draws a single flat stroke, because spool will not say something errored when it never ran. A call to a connector says which service it reached, and fetches no icon from anywhere. A search for a connector's tools stays quiet unless it comes back empty, which is the only trace a connector you have not signed in to leaves. A sub-agent's work reaches the log too, so the frames it writes are reachable from the row that wrote them.

- 1db32f3: What you are pointing at now reaches the agent chat without you typing a path. Every selected frame and element becomes a chip above the composer, not just the first one, so "make these consistent" is a thing you can say. The strip stays one line: either the chips fit or it becomes a count you can open into the list, and dismissing a chip deselects that thing out on the canvas. A frame you stepped inside gets a chip too, without a dismiss control, because the way out of a frame is esc. The prompt carries one selection block naming every entry with its path, and the transcript keeps a line under your words saying what went with them. You can also paste or drop a reference image into the composer and it rides along as bytes, so nothing is written into your project.
- 9be4c95: You can stop a turn you no longer want, and you can say the next thing without stopping the one that is running.

  The composer's footer holds a stop while a turn is in flight, and esc does the same thing from the field you just pressed Enter in. Click out to the canvas to watch a frame repaint and esc still stops the turn, once the canvas has nothing else to close. What it sends is a request rather than a kill: the agent survives it, finishes writing whatever it was in the middle of, and reports a clean ending, so nothing on disk is left half written. The log says `stopped` where it would otherwise say the turn was done. A tool call the stop caught is marked stopped rather than failed, because it never ran, and one caught before the agent had finished saying what it was reading keeps the half of the line it got to. The agent is told why its work ended, and you are not shown a note about your own press.

  Enter during a turn no longer goes nowhere. The message is taken and held, and it stacks inside the composer above the chips, dimmed, with a take-back on each row. Nothing is written to the agent mid-turn: every held message goes out the moment the result arrives, in the order you said it, as one turn. Each one carries the chips that were up when you pressed Enter, so a message that waited nine minutes still means what you were pointing at when you wrote it.

  Stopping cancels the queue and hands every word back into the composer, above whatever you were typing, one blank line between them, in the order they were going to be said. Taking one back by hand does the same thing, because there is one place for words that leave the queue unsent.

- 8bb883a: A project can hold more than one conversation with the agent, they keep running when you look away, and closing the laptop no longer deletes what you read yesterday.

  Threads sit in a row above the transcript. The open one takes the room it needs and is named by what you asked, because that is the only name a conversation has. The rest shrink to their mark. A plus leads the row and every tab has a ✕ on hover. Pressing a thread brings it to the middle of the row, so the half-cut mark at the edge is the way to the next one. Switching a thread leaves the canvas exactly where you put it.

  A thread's mark says what it is doing. The one you are reading draws nothing, since the transcript below is already saying it. One working elsewhere turns. One waiting on you is a disc held inside that ring, and it is the loudest of them on purpose, because it is the only one that is stuck: a question, an approval nobody has answered, or a login that is not there. One that finished while you were away is a solid dot. An old one is nothing. Opening a thread reads it, so the dot clears when you look and the disc does not.

  Spool writes down what the rail drew, one file per thread. Nothing is shortened, so a thread you come back to reads the same as one you watched, screenshots included. The conversation itself is the agent's own session, picked up again under the id spool gave it, so a second message remembers the first and the log keeps every turn.

  A restart stops a thread and never restarts it for you. The log ends where the power went, whatever was running is marked stopped, and nothing offers to run it again. A thread whose agent session has expired reads as finished: the transcript is still there, and the composer says a new thread starts here rather than offering something that would fail. Closing a thread takes the tab away and deletes neither the agent's session nor spool's record of it.

  When the agent refuses to start, it now says why in its own words instead of the log saying only that it is gone.

- 0d704b9: Refreshing the page no longer kills the agent. A turn belongs to the daemon now, not to the browser tab reading it, so a reload, a closed lid or a few seconds of dropped wifi leaves it working. When the canvas comes back it goes and finds the turn still running in that thread, replays what it missed, and carries on from there. The work in flight is not lost and nothing is drawn twice.

  Two things stop a turn, and both are a hand: the stop under the composer, and closing the thread it belongs to.

  A turn that finished while you were away is kept readable for five minutes, so you come back to how it actually ended instead of a thread marked stopped.

  Messages you queued while the agent was working are kept with the thread, so a refresh no longer drops them. And when a stream really does die, the rail says what happened instead of the same six words for every cause.

- b7ec23d: The daemon can now run your own installed Claude Code and stream a turn back as it happens. It spawns the `claude` already on your PATH and reuses the login you already have, so there is no second sign-in and no key to paste anywhere. Writing under `design/` runs without asking. Everything outside it needs your say-so, and until the chat panel exists to ask you, the agent is simply refused there and stops. Your own settings, skills, connectors and hooks come along with it. The project's settings file does not, so opening someone else's design cannot change what your agent is allowed to do. Nothing draws any of this yet: the canvas rail that talks to it comes next.
- 5e10c55: The log says when the agent was thinking, and how long for.

  A request going out writes one line in the transcript — a mark, the word `thinking`, and a duration that counts until the log has something to show you and stops there. It is written once and stays. Nothing above it moves when the answer lands, and the line is still there an hour later, so a transcript with a long gap in it now says where the time went instead of looking like two writes eleven seconds apart.

  The count runs through the model's own reasoning, which is the part of a turn there is otherwise nothing at all to look at for. It stops on the first words or the first tool call, so a turn that reasons for half a minute before saying anything reads as one line counting to `31.2s` rather than a rail that has gone quiet.

  It is a duration and never a thought. The wire sends no thinking text at all, so a line claiming to show one would be inventing it.

  The stroke on the composer's border is unchanged, and the two are not competing. The stroke says whether anything is happening at all, in the corner of your eye, for free. The line says what happened and how long it took, in the log, when you go looking.

  Two writes to one frame either side of a request are two lines again, with the wait between them saying why they were not one run.

- 3b6e016: Press `ctrl+o` to jump back to where you were before a finder pick, a walk, or a page switch; `ctrl+i` goes forward again. Both work from inside a frame.
- 7089792: `spool logs <frame>` now tells you why a frame's cover never landed. Before, a frame whose self-capture kept failing just sat as a dark placeholder with no way to find out why. Now the last failure reason (the document was too large, the reply never came, and so on) is printed after the frame's boot logs, and it clears itself the next time a capture succeeds.
- 4125209: A frame can import a project asset: an imported image, or a font `shared/fonts.css` names by a relative `url()`, rides inside the served document so frames render with the project's real files.
- 4125209: Added the frame finder: press `/` (or the platform modifier with K) to search frames by name and jump straight to one on the canvas.
- 5f7a295: There is now an address you can remember. Open local.spool.page in any browser and it finds spool running on your own machine and takes you straight to it. If nothing is running yet it tells you how to start it, and it keeps listening, so the canvas opens by itself the moment you do.

  Nothing you work on goes anywhere near that page. It only asks your machine whether spool is answering, and once it is, everything is back on your own computer where it was.

  `spool open` and `spool serve` now print the address under the real one. The real one stays first, because that is the truth and the one your agent uses. If your daemon is on a different port, the printed address carries it.

  The daemon tells that page two things about itself, its name and its version, and only that page and pages served from your own machine can ask. Nothing else about spool became readable from a browser tab.

- a070221: Breaking: play now happens on the canvas, and the player's inspector rail goes with the change.

  Press play and the app's furniture dissolves — the top bar, the sidebar, the agent rail, the tools — the canvas takes the whole window, and the camera flies into the frame until it fills the screen. The canvas dims away behind it and the player takes over. The zoom crosses where the rails were instead of sliding under them, so it is one motion from the press to the prototype. `⌘esc` (`ctrl+esc` elsewhere) flies you back out, to the frame you are standing on rather than the one you started from, so if the walk moved you the canvas agrees. Every human door goes this way: `p`, `shift+enter`, the play control on a frame's label, and "Play from here".

  The player fills the screen edge to edge now, the way a video player does. Bars only ever come from the frame being a different shape than your window, and a frame is never blown up past the size it was drawn at. `⌘f` fills the screen for real, and so does the control on the pill.

  The player's chrome is one pill: the frame's name, restart, fullscreen, close. It shows itself once when you arrive and then gets out of the way, and it comes back when you move the pointer down to it — the way a video player's controls do — so it is never sitting on top of a prototype's own footer while you are using the prototype. The inspector rail is gone, and with it the session tape, the state and mock readouts, and the motion switch in its footer. Rewind goes with the tape and back goes with the rail; restart covers both. This is what breaks: the standalone `/play/` page a phone or an agent opens loses those controls too.

  One new rule across the whole app: spool never takes a plain key from a prototype you are using. Every ordinary key belongs to the app being played, its own `esc` included, and spool's own gestures all sit behind `⌘` on a Mac and `ctrl` everywhere else.

  `/play/...` is still served, unchanged, for agents and for opening a prototype on your phone. It is just no longer where a press on the canvas sends you, and refreshing mid-play returns you to the canvas, because play is not a URL.

- dcf9c51: Breaking: the inspector rail is gone, and with it the elements and connections tabs. The connections list existed to be the one home for walks the canvas could not draw, and the canvas draws them now, on the frames that declare them. The right side of the canvas belongs to the agent panel that is being built there. Selecting elements on the canvas itself is unchanged: click a frame to go in, click again to pick what is inside it. The `stamp-labels` endpoint the rail used is removed too.
- 4125209: A frame is now live exactly when it is drawn big enough to read. Smaller frames rest as their stills and hold no document, selecting a readable frame points at its real elements rather than its still, and a selection holds every frame it reaches, not only the last.
- cdd3104: Both rails come back the width you left them, and shut if you left them shut.

  The pages navigator and the agent rail each held their width in memory only, so every reload threw it away and reopened them at their defaults. A width now survives the reload in the browser you set it in, which is where it belongs: it is a fact about the screen you are sitting at rather than about the project, so it never travels to the daemon and never arrives as somebody else's layout.

  The two rails also stopped each declaring their own copy of what a width is. The strip, the floor, the ceiling and the two thresholds have one home now, along with the rule for where a rail lands when the hand lets go of it. Only which arrow key opens which stayed with each rail, because one is on the left and one is on the right.

  Nothing is migrated. A remembered value that is not what its key means today is deleted and the rail opens at its default, because every value this holds is one a person can restore with a single drag. A default nobody has changed is never written down at all, so changing one in a release still reaches everybody who never touched it.

- 1db32f3: Breaking: `spool selection` prints a `<selection>` block instead of JSON, and prints nothing when nothing is selected. It is the same text a prompt from the agent chat carries, so a script that read the JSON list needs updating, and an agent reading either surface now reads one thing. A frame is its name, its path and its size. An element is its frame, what the source calls it, and its path with the lines it spans, with its excerpt on the line below. Every entry always carries its path, and when excerpts are dropped to stay inside a budget the block says how many.
- b275df2: Press `?` to open the shortcut sheet: every key and gesture spool answers, grouped on one panel. Esc or `?` closes it. Menu and tooltip key hints now come from the same place the keys themselves do, so a hint can never say one thing while the key does another.
- 7426014: The threads leave the row above the transcript and stand in a column down the agent rail's outer edge.

  Each conversation is one cell in it, newest at the top, with the open one carrying the accent. Nothing in the column is a name. Point at a cell and the thread arrives beside it over the log, with what it is called, the last line it drew, how long ago that was, and a ✕ to close it. A press opens it. Tabbing to a cell shows the same thing, and its ✕ is the next stop after it. The column costs the same whether there is one conversation or twenty, where the row ran out of room at four.

  Which thread you are in is written once, above the log.

  A thread is named by the frames it wrote rather than by what you asked. An ask is a sentence and a name is a label, so the old name was a sentence cut off wherever the room ran out. A thread that has written nothing yet is still its ask, and one nobody has said anything to is still new. The name is worked out fresh every time it is drawn, so there is nothing to rename and nothing to keep in step. What spool writes down still keeps the first thing you said.

- 29d9aec: The canvas draws the walks you can take, not just the ones an arrow can reach. A walk that lands on another page now shows as a small tag docked to the frame that declares it, saying where it goes and on which page. Press it and you travel there: the canvas switches page, centres on the frame and selects it. Zoom out past the point where the words fit and each tag shrinks to a stub on the frame's wall, so you can still see which frames leave the page. A walk that lands nowhere is not drawn: there is nothing to press, and where it is broken is a question for `spool flows` and for the agent that would fix it. The threads button governs the whole layer, arrows and tags together.

### Patch Changes

- 23c617f: An image attached to the agent composer can be looked at, not only dropped. Pressing the tile holds the picture up over the rail at size, in the same overlay a screenshot from a tool call opens in, and esc or a press on the backdrop puts it down. Taking the reference back is now a ✕ in the tile's top right corner rather than the whole tile, so the only thing you could do with your own picture is no longer delete it.
- d881bc6: Move the agent rail collapse control into the thread nameplate so it no longer covers transcript rows. The install wall keeps its standalone control.
- 6715a4a: Show each delegate as one transcript row with its current task step underneath. Delegate rows no longer expand into nested tool transcripts, and the task step disappears when the delegate settles.
- a3d8c2c: The agent asks before mutations outside design/, and for nothing else.

  Every shell command, web search and out-of-project read used to raise an approval, which buried the one ask that matters. The harmless tools are now allowed outright — reading anywhere, fetching pages, searching the web — and the shell never asks at all: commands run inside Claude Code's own sandbox where the OS confines their writes to the project, and spool's own verbs run outside it, because they are read-only by construction and Chrome cannot launch inside it, so a shot is just a shot. Editing files outside design/ asks the human first, exactly as before.

- 2b523cf: The agent log's way-back chip no longer draws at the bottom of the transcript, and pressing it always carries the reader down: to the last message's first line when that is still ahead of them, and to the newest word when they are already inside it.
- 8532609: An agent's reply arrives more cleanly. Each word fades in once, where it used to appear at full strength and then blink away to fade in. And a reply long enough to be a document grows as it arrives instead of holding its finished height from the first line, so the log stops filling with empty scroll under a message still being written.
- 3316a85: Stopping an agent now stops everything it started. The kill reaches the whole process tree rather than only the binary, so a dev server the agent left running goes with it, and a binary that ignores the first request is made to go a few seconds later.

  A turn that finished no longer leaves its thread stuck. If the binary hangs around after the answer has landed, the daemon lets it go on its own for ten seconds and then ends it, so the next message in that thread sends instead of being refused until you restart the daemon.

  Closing the model menu, or leaving the page while it is asking who you are signed in as, now ends the process that question started instead of leaving it running.

- f7c7974: The agent rail now rides out connection drops. A dropped socket no longer ends the turn: the rail goes back and reads the same turn from where it left off, so the work carries on and nothing is drawn twice. Queued messages survive a refresh and a daemon restart, are never sent twice, and come back to the composer when you close the thread they were waiting in. Stop works while the agent is asking, and a message typed before the rail has finished loading stays in the box instead of vanishing.
- b4aef45: The model's own thinking no longer draws a line in the log.

  It had drawn a turning mark and a duration, and the duration was the whole of what it said, because the wire sends no thinking text at all: every thinking field in every capture is empty, and only two of the thirty-six thinking blocks measured were long enough to count, so `thinking 0.0s` was the ordinary reading.

  The wait in front of it is a different object and keeps its own line, measured from the request going out rather than from the block, which is the number worth reading.

  Nothing in the log appears and then goes away. The old line was the one thing that did, and removing it dragged everything above it down 38.3px at the moment an answer landed.

  A restored conversation written by an older version keeps its words and its rows. The line it stored for the thinking block is dropped as it is read.

- 281b350: Leave the canvas in a background tab while an agent works and it is current when you come back to it, without a refresh.

  The connection the canvas listens on now says something every fifteen seconds. A browser that stops hearing it hangs up and opens a new one, so a laptop that slept, a network that moved, and a daemon that restarted are all noticed instead of looking like a project nobody is editing. Reconnecting reads the project again rather than trusting what is on screen, because edits made while the connection was gone were never delivered.

  A daemon that is actually down is retried more slowly each time instead of twice a second forever.

  Coming back to the tab is now a thing that happens: frames that stopped animating start again, pictures that a throttled background tab could not take are asked for again, and a frame edited on another page keeps its debt until you go back to it.

- 4f3913e: The canvas loads faster.

  The project list no longer blocks on disk walks. Every registered project's frames and covers used to be read one after another, in the middle of the one request the app waits on before it can show anything; now they are read together and out of the daemon's way.

  A canvas no longer waits on the link graph to be resolved before it opens, which is a pass that can start a browser. And frames appear as soon as the canvas knows where the camera is, rather than at the next sweep after that.

- 763e975: A frame's cover no longer runs tens of seconds behind the file while an agent is streaming writes to it. Before, every write reloaded the frame and reset the wait the canvas gives a fresh boot to settle, so a steady stream of writes could starve the photograph until the stream paused. Now a picture that has been wrong for four seconds gets photographed mid-write instead of waiting any longer, and the next capture heals whatever that one got wrong.
- e2a3d78: `spool check` no longer reports a `.txt` import as a missing module: the compiler has always served the file's text, and the checker now types it as the string a frame receives.
- 4125209: A stale host left in spool's config no longer bricks the daemon on startup.
- 54defc1: The log stops fighting a reader who scrolls while it streams.

  Following used to switch back on within 24px of the bottom, and following's target for an entry taller than the box is that entry's first line, so reaching the end of a long live message warped the view back up by the whole overflow, on every attempt. Following now ends the moment an input that could carry the reader away arrives, a wheel, a finger, a scrolling key or a scrollbar drag, and nothing re-arms on proximity: it resumes where resuming moves nothing, at the end when the end is the follow point, or when the reader sends words of their own.

  A chip floats over the log's foot whenever the live end walks away, saying live while the turn writes and latest once it settles, and pressing it returns to where following holds. A watcher on the log's body keeps the pin honest when height changes without a new entry, and the log's own scrolls are told apart from the reader's by position rather than a one-shot flag, which coalescing scroll events used to swallow.

- f258d2e: Frame labels stay visible above neighboring frames instead of slipping behind them when frames sit close together.
- 6b035e4: Live frames now hold their animations while the camera moves, and get them back the moment it settles. A frame keeps showing the pixels it last painted, so nothing on screen changes — it simply stops spending the renderer on frames nobody is reading mid-pan. A pan across eight animated frames used to spend a sixth of its time inside their own animation loops; it now spends almost none.

  The frame you went inside never holds, and neither does one being photographed for its still.

- 1e73b35: A canvas you walk away from now goes quiet. A live frame that has spent a minute with nothing on it stops running its animations: no pointer over it, not selected, not entered, and the camera at rest. It keeps showing the pixels it last painted, so nothing on screen changes. Point at it, select it, go inside it, or move the camera and it runs again at once.

  The minute is long on purpose. Comparing two frames' motion side by side means touching neither of them, and that has to keep running for the whole of a look.

  Animations also pick up where they stopped instead of jumping ahead to where they would have been, because a frame's animation clock now stops with it.

- 54a44bd: Make Ctrl-O and Ctrl-I restore the page, camera, entered frame, and selected frames or elements. Deleted frames are ignored during restoration.
- 4125209: The platform modifier binds correctly everywhere: ⌘ on macOS, Ctrl elsewhere.
- 1e04069: Playing a prototype in a normal browser window no longer hangs on a white screen. The shell hid the booting player with visibility, which stops Chromium from running animation frames inside the iframe, and the player waits on an animation frame before declaring itself ready, so the reveal deadlocked. The player now hides by opacity and stays inert, so it finishes booting while hidden. When a player genuinely cannot finish booting, the shell now says so after a few seconds and offers a link to the bare player instead of staying white. Errors thrown by browser extensions injected into the player are no longer mistaken for the prototype's own.
- 7d0b123: The rail never scrolls sideways, and a thread with nothing running stays quiet.

  A daemon restart could leave the rail asking after a turn that no longer exists; the daemon's ordinary "no turn to read" answer was drawn into the log verbatim, and its unbroken width dragged a horizontal scrollbar across the transcript. That answer now ends the read silently — the stored picture was already the whole thing to draw — and the log's columns clip sideways overflow so no row can ever widen the rail.

- 4125209: One `url()` in a frame's CSS no longer silently unstyles its still.
- 4125209: Stills are stored at the size they are shown instead of at full resolution.
- 6653adf: The canvas no longer redraws everything while an agent is streaming. A turn used to render the whole canvas ten times a second whether or not anything in it had moved, and every render refolded the log of every conversation the project had. Now a tick that changed nothing draws nothing, a transcript is folded once per change rather than once per render, and panning the camera costs the same whether a turn is running or not. Long conversations stay smooth.
- 463fd3f: The open thread's tab is the width its name wants rather than the whole row.

  It was growing to fill whatever the other threads had not taken, which spent the room on more of a sentence nobody finishes reading and drew the selection's accent as a rule across the entire rail. The tab now sits between its old floor and a ceiling, the leftover goes to the collapsed marks beside it, and the row scrolls under its fade the way a press already moves it.

- 624b693: A walk spool cannot read is reported once, where it is real. Passing a target down as a prop is how shared navigation is written, and leaving that prop out renders no link at all. Spool used to report every one of those as a walk it could not read, once for every frame mounting the component. On this repo's own canvas that was 173 reports over 4 lines of source, and now it is none. A frame that rendered and produced no link has no walk there to read. A frame nothing has rendered yet still reports, because that question has not been asked.
- b38cf0a: `spool upgrade` no longer reinstalls and restarts when there is nothing to install.

  It used to run the package manager and bounce the daemon every time you asked, whether or not a new release existed. Every canvas lost its connection and everything running under the daemon died, for no change at all. Now it asks the registry first, and when the answer is not newer it tells you so and stops there.

  It also will not move you backwards. The target has to be newer than both the cli and the running daemon, so an upgrade run in the ten minutes before a release reaches npm can no longer install the older build over a daemon that is already ahead of it. If the registry cannot be reached, the upgrade you asked for still runs.

  A real upgrade now says what it is about to cost and waits for a yes, because stopping the daemon takes every process under it down too. Only a terminal is asked. Scripts, agents, and the upgrade button in the canvas are unaffected, and `spool upgrade --yes` skips the question.

- a094a62: Fixed frame covers for WebGL canvases. A cover is a self-taken screenshot, and browsers clear a WebGL canvas's drawing buffer once they are done compositing it, so the shot used to come back black. Frames now get a correct cover whatever they draw with.

## [0.4.0](https://github.com/liamvinberg/spool/compare/v0.3.0...v0.4.0) (2026-07-27)

### ⚠ BREAKING CHANGES

- isolate project execution from spool authority
- replace canvas modes with tools

### Features

- add annotate tool for marking canvas elements with numbered orders ([5350cf3](https://github.com/liamvinberg/spool/commit/5350cf334128075f4ca6feea072c8f060973fcde))
- add custom scrollbar styling to sidebar pages list ([3eb78b6](https://github.com/liamvinberg/spool/commit/3eb78b6a01f8dabb7e5a18ff162e6f5c65b19ed5))
- add frame clipboard writes ([00f6896](https://github.com/liamvinberg/spool/commit/00f68967c8644a47b876c3c1539bc30d933a24ae))
- add frame hover preview to canvas selection ([85b4b58](https://github.com/liamvinberg/spool/commit/85b4b581e3300c6ee7de9b33227874d8a3fcea64))
- add offline design checking ([1fc375c](https://github.com/liamvinberg/spool/commit/1fc375c3b3c0777d990f689bbc0c8ec27c884157))
- add stilled prop to frame shell for thumbnail swap during camera movement ([7acc60c](https://github.com/liamvinberg/spool/commit/7acc60c3d8e7b44162c54155e0a248f460ad7d6a))
- add the selection inspector rail ([04d461c](https://github.com/liamvinberg/spool/commit/04d461c72948b48f26b462a0ebc6e8b2ec5755ab))
- add tidy and bare keys for the menu's verbs ([8f46726](https://github.com/liamvinberg/spool/commit/8f46726fd98f449baec48f6d241c6797c17cbf39))
- address a cover as a ladder of rungs under one content hash ([2ce7ef2](https://github.com/liamvinberg/spool/commit/2ce7ef274090c0f7477b3c15845fb6dba58c995f))
- fill dark navigation targets when a canvas opens ([8dc4c50](https://github.com/liamvinberg/spool/commit/8dc4c50aff33e75df9c4fca9852353faf1c6fb05))
- make agent verification deterministic ([09e8bf3](https://github.com/liamvinberg/spool/commit/09e8bf3038e48210f64d964730f927c00668e298))
- read the entered frame in the inspector rail ([638b2b6](https://github.com/liamvinberg/spool/commit/638b2b66d9bea448f63d23231bf21a692038197b))
- remove and search projects on home ([fcdf282](https://github.com/liamvinberg/spool/commit/fcdf282ebb1c35f4e3f2a98533a274b36119a414))
- remove camera glide stilling and simplify frame lifecycle states ([84e686e](https://github.com/liamvinberg/spool/commit/84e686e7a8acb4742434fc066ab7d789545cbf37))
- remove registered projects ([f27990c](https://github.com/liamvinberg/spool/commit/f27990cf03509937d0e8f8a4862fff97b3046094))
- replace canvas modes with tools ([02de89f](https://github.com/liamvinberg/spool/commit/02de89f1bdb9cf4d0fb89d49560ad35ac2c2f238))
- replace canvas sidebar with page tree ([73e22dd](https://github.com/liamvinberg/spool/commit/73e22ddeb3c19110c978a14addbd7a25a1f895dd))
- resolve computed navigation targets by reading a rendered frame ([b10d3b6](https://github.com/liamvinberg/spool/commit/b10d3b66118b5fe97f23f4f5afe80d1c7640fcd6))
- rework the player as slate chrome and a session rail ([37ef162](https://github.com/liamvinberg/spool/commit/37ef16296f154ff47f13a08e93512e0d1503ccca))
- serve project webfonts from the daemon ([92d9813](https://github.com/liamvinberg/spool/commit/92d9813b4c169203e4f244370331cc285466e193))

### Bug fixes

- adjust scrollbar width and add fallback for non-webkit browsers ([db4e8b5](https://github.com/liamvinberg/spool/commit/db4e8b5eb09ebd7bc42c27af51644cbd913cc298))
- bound boot covers instead of storing them at full resolution ([1911b1e](https://github.com/liamvinberg/spool/commit/1911b1e3e469823353bba83e7ca203fa4f18bf0b))
- bring the player back when its inner frame reloads ([949229a](https://github.com/liamvinberg/spool/commit/949229aae93ac899306e6e68130fb53d720b5239))
- confine project file access to design ([36050bb](https://github.com/liamvinberg/spool/commit/36050bb79692a2cd2a761dbfc997fe38e1bf3374))
- derive connections from navigation sites in imported files ([de05e92](https://github.com/liamvinberg/spool/commit/de05e92d7270775449658df47a4cc1cc169101cc))
- isolate frame still rasterization ([ffad4dd](https://github.com/liamvinberg/spool/commit/ffad4ddbc32e2df2640e0ec685cb2aa2afa620b9))
- isolate project execution from spool authority ([76d98eb](https://github.com/liamvinberg/spool/commit/76d98eb8c1328dca40458fea08ff1fbceba7be5f))
- join terminal box glyphs ([38f2048](https://github.com/liamvinberg/spool/commit/38f20485d005a3b6322cc9731bf91ca824a94e6c))
- keep canvas movement free of stutter and flicker ([aab9239](https://github.com/liamvinberg/spool/commit/aab9239cea73c75eac78c212becfa94d26d49a75))
- keep page tree navigation explicit ([9c95b58](https://github.com/liamvinberg/spool/commit/9c95b58452c508f7e0478718705c0f63dae337f2))
- keep terminal screens source-fresh ([af5fbd2](https://github.com/liamvinberg/spool/commit/af5fbd226bfc6cda36326774bdf8f28d18b97740))
- keep the player playable when one frame will not compile ([89fd2b9](https://github.com/liamvinberg/spool/commit/89fd2b96e3752c73690f9a39ecbb2b035bf44c21))
- keep the player rail from growing a sideways scrollbar ([8cbee32](https://github.com/liamvinberg/spool/commit/8cbee3279b2116c6c9dc7d77b601bdf65c38e3be))
- let boot covers be cached and revalidated ([7724174](https://github.com/liamvinberg/spool/commit/772417425a72e79041b33da5d744a8d61f8a0705))
- name unresolvable navigation targets in the connections rail ([390b220](https://github.com/liamvinberg/spool/commit/390b220d33f1110eb637421da0d6495b54bc186d))
- preserve player frame geometry ([8dc5b5c](https://github.com/liamvinberg/spool/commit/8dc5b5c23fec6d7886c716a225785887e8ce86b9))
- rebuild a frame's graph when an import finds the file it names ([610d256](https://github.com/liamvinberg/spool/commit/610d256f66dd6494fcceff2f48300fe81dbe040d))
- reject spoofed canvas frame messages ([421c245](https://github.com/liamvinberg/spool/commit/421c2454246ec2ad27e11f36fece43776d4fc186))
- restore resizable page tree ([394c3d8](https://github.com/liamvinberg/spool/commit/394c3d86bf7002d6174ebf44ef1139e839632315))
- stop a browser extension's error from killing the player ([b6041d8](https://github.com/liamvinberg/spool/commit/b6041d886626fbff2a1c8198cc25766b4d530018))
- take the terminal app down with its supervisor ([b6e6438](https://github.com/liamvinberg/spool/commit/b6e64383b4c6755f2e312c66927b1fe4dadc11a7))

### Polish

- hold a document only for a frame something asks for ([aebfb83](https://github.com/liamvinberg/spool/commit/aebfb8328d85f8d1860a48a14fffa6b49fa52c3e))
- keep an errand out of the way of a boot somebody asked for ([f39a844](https://github.com/liamvinberg/spool/commit/f39a844d7693644e30ac7f4a22d751c3e811786e))
- keep the flow graph in the daemon instead of rebuilding it per read ([bc17b93](https://github.com/liamvinberg/spool/commit/bc17b9337f6d929e971d95322dfd6b9e3e872e47))
- land a walk without waiting to capture the target ([b2891d4](https://github.com/liamvinberg/spool/commit/b2891d4d726dbbf983d35cb73b2285f60c5c3152))
- open the canvas without waiting on the link graph ([fcabe9d](https://github.com/liamvinberg/spool/commit/fcabe9da4428f68f6d6d756b8b6b920e3c2d2ef7))
- send one shared-edit wake naming the frames it reaches ([23c847d](https://github.com/liamvinberg/spool/commit/23c847d546cb8cafcbcbbfce5be35f6dca48580a))
- share one flow build across the reads a burst of edits asks for ([fc42f9d](https://github.com/liamvinberg/spool/commit/fc42f9d11b5a5d76a9492f43a4694f7390327845))
- simplify temporary tool feedback ([b4ede14](https://github.com/liamvinberg/spool/commit/b4ede1464ef9902ee32d9ca2e8bdde5b95f4b0c7))
- wake only the frames a shared edit reaches ([d6a9b6c](https://github.com/liamvinberg/spool/commit/d6a9b6c9d8e47117fc0709c9f0751d2126dceddd))

## [0.3.0](https://github.com/liamvinberg/spool/compare/v0.2.0...v0.3.0) (2026-07-23)

### Features

- add frame reload action ([d5e94c7](https://github.com/liamvinberg/spool/commit/d5e94c73dd5d5474de70342beffd334e3d4743e7))
- add landing page blueprint frame with engineering drawing style ([b76df55](https://github.com/liamvinberg/spool/commit/b76df55d053a709acddf1e316b269b357d010150))
- add spatial navigation boundary constant and test ([e75c9ec](https://github.com/liamvinberg/spool/commit/e75c9ecf16adab2102eb06ec1869ebde502aa33d))
- canvas file tree — element tree sidebar with multi-element selection ([222e41f](https://github.com/liamvinberg/spool/commit/222e41fb936f8863114a88b026570ebd0eb02b55))
- export canvas frames ([3cfcd86](https://github.com/liamvinberg/spool/commit/3cfcd861542f08abf22c8334f2addf060b0bf957))
- multi-element selection with hover previews ([196101f](https://github.com/liamvinberg/spool/commit/196101f74e69319b020f4beddc26b228116efeb5))
- operate terminal frames live in player walks ([d145632](https://github.com/liamvinberg/spool/commit/d14563259c0e45f25c1a38a93919b13becaea1a0))
- operate terminal frames live in player walks ([5b74883](https://github.com/liamvinberg/spool/commit/5b748835e3435818156b7ddb6a871202e4ab713b))
- page-aware frame discovery and daemon surfaces ([c46a797](https://github.com/liamvinberg/spool/commit/c46a7970a849a47d8c78ca5bd88691493365e10d))
- pages — folders on disk, one canvas per page ([ef1cd00](https://github.com/liamvinberg/spool/commit/ef1cd0060ce63a0f4476044baad93e27ff95d9c9))
- pages sidebar, per-page canvas, portal jumps ([d452bb9](https://github.com/liamvinberg/spool/commit/d452bb99bb0d3921f4a6fa7430c5ebcffe8445b8))
- read the flow map from source ([#34](https://github.com/liamvinberg/spool/issues/34)) ([1e5efb7](https://github.com/liamvinberg/spool/commit/1e5efb7c72fc5d50cd28d37bc254e323678d54f8))
- remove editor chip from selection overlay and update terminal tests ([b829033](https://github.com/liamvinberg/spool/commit/b829033cd1b06f6303c6e64faddc0435437993f6))
- sidebar element tree with selection sync and editor jumps ([a4d7c53](https://github.com/liamvinberg/spool/commit/a4d7c532bfb0305e752a1e213b8f6e1edadf64a5))
- spatial keyboard navigation between frames ([8da1a0c](https://github.com/liamvinberg/spool/commit/8da1a0c3d3cc95d7c9dc750fa80311469769a76c))
- teach pages in the agent skill, page term in the glossary ([ad49ddd](https://github.com/liamvinberg/spool/commit/ad49dddec670249305fcd84f70e3033f8239301e))
- terminal frames — term.tsx runs live on the canvas ([#43](https://github.com/liamvinberg/spool/issues/43)) ([25f5233](https://github.com/liamvinberg/spool/commit/25f52331b2e954fb807f3840c0299f6e69efe8c3))
- undo and redo for frame move, resize and nudge ([b3801cb](https://github.com/liamvinberg/spool/commit/b3801cb28d9d2b6ac71964f66f641ef7fdfc72ef))
- update external link dialog layout and styling ([6c66174](https://github.com/liamvinberg/spool/commit/6c66174cb0870afd62e3a49187e52b0c914d5ad4))

### Bug fixes

- boundary rows select on click, the chevron alone expands ([8fe05e5](https://github.com/liamvinberg/spool/commit/8fe05e5d53853897944953de95381ecfd031dc31))
- confirm external links without leaving prototypes ([817f7a2](https://github.com/liamvinberg/spool/commit/817f7a29c6942f20a362a29596e5d396547470c5))
- confirm external links without leaving prototypes ([7d96125](https://github.com/liamvinberg/spool/commit/7d961252b343aa7c492e00766c988fda62a9d276))
- deduplicate frame arrows ([1bca8bc](https://github.com/liamvinberg/spool/commit/1bca8bc662063a5c23838fdd9a105a040d5161e0))
- deliver sigwinch so terminal resize reaches the tui ([91259fd](https://github.com/liamvinberg/spool/commit/91259fded7fcb3e19969c5ecf145ffe7876f4384))
- deliver the winch to the spawned app ([1a88d35](https://github.com/liamvinberg/spool/commit/1a88d357ef806fa640cd97611de64b17625bba03))
- exit chord works wherever focus sits ([ab1fb8e](https://github.com/liamvinberg/spool/commit/ab1fb8ece7a532926d384fa8f682f7b00d4c0cf6))
- player follows canvas geometry live ([dbb0192](https://github.com/liamvinberg/spool/commit/dbb01924b763d5c0b578e4049b38172849f4db59))
- preserve design selection on right click ([96f59da](https://github.com/liamvinberg/spool/commit/96f59da224536798e93ecf4ecc2c670e99dad66c))
- replace grace hibernation with warm pool and wake queue ([657d2c6](https://github.com/liamvinberg/spool/commit/657d2c6ceed1ddb5cd12efc742a3a78fd0b15461))
- replace grace hibernation with warm pool and wake queue ([f2a12b0](https://github.com/liamvinberg/spool/commit/f2a12b04bd1ec12f64263af940de4e7c7002744f))
- sidebar labels terminal frames term.tsx ([e83d679](https://github.com/liamvinberg/spool/commit/e83d67910f5cca762b93c4639ead92b6112bd2f6))
- spell the terminal exit chord as esc ([8cd9b07](https://github.com/liamvinberg/spool/commit/8cd9b07711fd36ec790f773d110bd96f444d57c2))
- spell the terminal exit chord as esc ([2d8fea6](https://github.com/liamvinberg/spool/commit/2d8fea6b9a28a246ffd88e61e65f948030db5bc4))
- stop daemon with open event streams ([16efbcb](https://github.com/liamvinberg/spool/commit/16efbcb1f7e4bcb122a86ad71dcb5c58e20b5f23))
- terminal cells match the emulator's real metrics ([a546e66](https://github.com/liamvinberg/spool/commit/a546e6669b27d3f0f2c78b75f30713b32a3e3870))
- terminal document follows daemon size, pins cell metrics, exits from anywhere ([2aba857](https://github.com/liamvinberg/spool/commit/2aba8577bd67ab696a2c6e4ace431b9c318240f5))
- terminal frame rows offer no element tree ([a82a9a6](https://github.com/liamvinberg/spool/commit/a82a9a60a6a629747a739c7e696870cb91d7c966))
- terminal frame rows offer no element tree ([6c4d014](https://github.com/liamvinberg/spool/commit/6c4d014c4da9583331cd9bb70377a7592cd79698))
- terminal frame stability — resize, replay, death, exit ([af75151](https://github.com/liamvinberg/spool/commit/af7515189790178a8bf24e089431e238a5368c44))
- terminal sessions own the grid size and keep a dying tui's last screen ([564cae6](https://github.com/liamvinberg/spool/commit/564cae62f9c0db7403f133460a6ef53387e5695c))

### Polish

- distinguish development favicon ([ed8b2e0](https://github.com/liamvinberg/spool/commit/ed8b2e06dc1ad9d8bc57540e810cd17594dd1f7b))

## [0.2.0](https://github.com/liamvinberg/spool/compare/v0.1.0...v0.2.0) (2026-07-22)

### Features

- extract frame label into reusable component ([7585c6c](https://github.com/liamvinberg/spool/commit/7585c6cf1ce571b537879d88111c480205a822bd))
- the update loop — spool upgrade, daily check, toast + self-reload ([#30](https://github.com/liamvinberg/spool/issues/30)) ([f20716b](https://github.com/liamvinberg/spool/commit/f20716b29984ca0ba39e2c51bf38ecef7f536127))

### Bug fixes

- align the update loop with its contract ([cc4646b](https://github.com/liamvinberg/spool/commit/cc4646b4938a33c921a17ad4065da51b457f72f9))
- keep canvas zoom inside entered frames ([1de8ad9](https://github.com/liamvinberg/spool/commit/1de8ad94b24f3c71e26055261acfe0a4eddda7a9))
- prevent browser history swipes ([4611238](https://github.com/liamvinberg/spool/commit/46112384d06168b4bff5ce5731294549fc786ceb))
- serve the spool mark as favicon ([09c3646](https://github.com/liamvinberg/spool/commit/09c3646e93a0e8a269b0b5faf7a955477f0b9b1e))

## 0.1.0 (2026-07-22)

### Features

- agent verbs — selection, flows, shot, logs, url, skill ([1fa265d](https://github.com/liamvinberg/spool/commit/1fa265d0427f2b6cd1d972ac048968862d206001))
- busy-port serve drains the app and stands down for a sibling daemon ([a9b8873](https://github.com/liamvinberg/spool/commit/a9b8873b1673a6dacbfc839c613db97e6abeb1fc))
- canvas hands — selection, stamps, geometry, trash ([2da4c94](https://github.com/liamvinberg/spool/commit/2da4c94378ea05ff13f3da297cf998910c162b92))
- canvas spa — projection, camera, modes ([d3c8fbb](https://github.com/liamvinberg/spool/commit/d3c8fbb47c557ac4392d199f0af0937ac904e332))
- daemon and compiled frame serve ([6cd599d](https://github.com/liamvinberg/spool/commit/6cd599dc682c58770b4a213bf46ea2a7f76bf47f))
- dogfood split — checkout daemon rides its own state dir and port ([e83fae0](https://github.com/liamvinberg/spool/commit/e83fae0d881c130a8f2c64c7659bf8d72a730c57))
- enter flies the camera to fit the frame ([deae998](https://github.com/liamvinberg/spool/commit/deae998f5b443691cc7cab1287ee555e7b2c9b80))
- entered chip and walk stills — play reads as play ([d7f00fe](https://github.com/liamvinberg/spool/commit/d7f00fe93d799c51099dd72de0ba0bdd1f0cc17c))
- figma hands — frame clicks, element scope, edge resize ([33fceb2](https://github.com/liamvinberg/spool/commit/33fceb298acbc32f2134ec4e7079a3a5d1157737))
- flow arrows on canvas — links drawn, walked edges witnessed ([c2a7e35](https://github.com/liamvinberg/spool/commit/c2a7e3558a2b5bede50b7049e27aef99aa09de64))
- flow runtime, scenarios and mock ([00887ef](https://github.com/liamvinberg/spool/commit/00887ef89f93871fcb374055222c83c4d18c9e43))
- player ([dd177dc](https://github.com/liamvinberg/spool/commit/dd177dcffe4e96e6630466dfa0225dd013a063d7))
- skill text — the complete contract, final signposts and pointer ([a8ea68e](https://github.com/liamvinberg/spool/commit/a8ea68e4be8bf57c6d12463dcf7d1c3cc49d6ae4))
- snap — every landed alignment, resize edge stops ([e209445](https://github.com/liamvinberg/spool/commit/e20944517251a0adc3acffe2c1a6ab9a0783d559))
- spool autostart — launchd start-on-login, off removes ([e7ffcbe](https://github.com/liamvinberg/spool/commit/e7ffcbe97d441a3e2364ff0c4b25b69c1373f1f0))
- spool init and open ([b369479](https://github.com/liamvinberg/spool/commit/b369479d645e408b2eef21fea271452926fbd475))

### Bug fixes

- first release is 0.1.0, not release-please's 1.0.0 default ([20db23c](https://github.com/liamvinberg/spool/commit/20db23ceaeb43a9a12089e01e5bc4819eee0524c))
- fixed elements pin to the frame while it scrolls ([5f6227a](https://github.com/liamvinberg/spool/commit/5f6227a9ba8ffd03ce681bf59faba87e9baae234))
- letterbox clears the pill on fine pointers ([b6de524](https://github.com/liamvinberg/spool/commit/b6de5247c757be6a5547411f80e317491592eaa0))
- registry rejects unreadable or malformed files ([3715f57](https://github.com/liamvinberg/spool/commit/3715f57088d2154eac12bde7dcb38834e2bff634))
- review findings — poll and self-path dedupe, honest error name ([1c224c7](https://github.com/liamvinberg/spool/commit/1c224c768846cf004df4d457067f1bdd3375edef))
- review findings on frame serve ([5baf86a](https://github.com/liamvinberg/spool/commit/5baf86a04a58ebe9248c0d6bf8280bcd031daa7e))
- screens scroll like iframes, height chain in the baseline ([2a5e8c3](https://github.com/liamvinberg/spool/commit/2a5e8c380531db8b1bea5b188b96da793d47ecdd))
- shim identity rides the document hash ([96f8227](https://github.com/liamvinberg/spool/commit/96f82270bc884691221f15f662f4cc6c8a456285))

### Polish

- biome format ([253d3e7](https://github.com/liamvinberg/spool/commit/253d3e7d30ccb9fa1cdd5509d8a3b37134ebf5d4))
- dedupe realpath, prepack build, stricter flags ([f8477e7](https://github.com/liamvinberg/spool/commit/f8477e749b3c5a1eda53a2b15f3728ae8e194fc8))
- install and develop docs ([2e2178f](https://github.com/liamvinberg/spool/commit/2e2178fa354e2fdf5f2a2c7f718d595434b2c151))
- pill breadcrumb shows the stack tail ([a436711](https://github.com/liamvinberg/spool/commit/a436711764401bd4980abe66a645d29932ff8159))
