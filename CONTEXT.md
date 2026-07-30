# spool

Spool is a local-first prototyping canvas: agents author frame files on disk; people arrange them spatially and walk the flows between them. One context for the whole repo; these terms are canonical in issues, specs, tests, and code.

## Language

### System

**Project**: A product repo's `design/` folder as spool knows it, registered only by explicit `init` or `open`, never by scanning. _Avoid_: workspace

**Daemon**: The one per-machine local server every spool surface is served from.

**Frame**: A folder under `design/frames/<name>/` holding one entry file — `frame.tsx` (html) or `term.tsx` (terminal); the unit prototypes are made of. The entry filename is the kind, and a folder holding both is a discovery error. _Avoid_: screen, artboard, mockup

**Terminal frame**: A frame recognized by its `term.tsx` entry. Until project code can run inside an OS sandbox, spool never compiles or executes the entry; the canvas and player render a spool-owned static disabled surface instead. The second and final frame kind.

**Variant**: A frame whose `--`-suffixed name marks it as an alternative take on its base frame (`home--empty`).

**Geometry sidecar**: The app-owned `frame.json` beside a frame's source, holding its place and size on the canvas. _Avoid_: layout file

**Asset**: A project file whose bytes ride inside the served document instead of being fetched: an image a frame imports, or a font `shared/fonts.css` names by a relative `url()`. There is no asset route and no asset URL, and the import is what puts the file in a frame's closure. _Avoid_: static file, public folder

### Canvas

**Canvas**: The infinite surface where frames are arranged; a projection of the disk, never a source of truth. _Avoid_: board

**Page**: A one-level subfolder of `design/frames/` grouping frames into a journey; each page is its own canvas. The flat top level is the permanent root page, and frame names stay unique across the whole project. _Avoid_: group, section, sub-page

**Exit**: A walk that leaves the active page, drawn on the frame declaring it: a short leader off the wall into a mono tag naming the target and its page. Pressing it travels — the page follows, the arrival is centred, the target ends up selected. Below the width its own words need it degrades to a stub on the wall. It replaced the portal chip, which #58 deleted with nothing in its place, and it is the only thing the walk layer draws: the canvas draws walks you can take, so a walk that lands nowhere has no face. _Avoid_: portal, chip, marker

**Select**: The default and only pointer tool: a click takes the frame to arrange it, a double-click enters it, and holding the platform modifier takes the element under the cursor instead. Selecting a readable HTML frame leaves it visible and running while Select owns the pointer; an unreadable selection stays held behind its still. _Avoid_: interact

**Hand**: The canvas tool for panning with a primary-button drag; holding Space borrows it temporarily.

**Entered**: The state of a frame after a double-click: pointer and keyboard input belong to its app, and walks happen in place. Esc leaves an html frame. A terminal frame currently has no TUI keyboard session because it renders a static disabled surface; the platform modifier + Esc still leaves it. Holding the platform modifier hands the pointer back so an element can be reached; the frame keeps painting, because you are still looking at it. _Avoid_: focused, interact

**Still**: One immutable, content-addressed picture of a frame, taken by the frame itself once it has finished arriving with its own fonts and settled content. It is what the canvas draws below a readable size, and it covers a frame until its document boots. A still is a placeholder, not an artifact: it is sharp up to 400 CSS px drawn width; above that, a nearby frame is live. _Avoid_: screenshot, snapshot

**Ladder**: Retired. A still is one image at one immutable URL, sized for the readable threshold; the canvas has no rung to choose. _Avoid_: variant, size, resolution

**Picture**: A frame below readable size or outside the viewport ring: its still on screen and no document behind it, for as long as nothing asks for one. _Avoid_: hibernated, unmounted, cold

**Caused mounting**: Why a frame holds a document at all: you went inside it, its picture is missing, its picture is wrong, or it draws at least 400 CSS px wide inside a viewport expanded by 25% on every side. The readable condition bounds documents by viewport area rather than frame count. Intent holds documents too: every frame represented by the current element selection. With no element picks, Select instead holds the selected frame, or the entered frame while its modifier is down. A frame being exported is held separately. _Avoid_: warm pool, wake queue, hibernation

**Errand**: The canvas borrowing a frame to photograph it — mount out of sight behind its own still, run, capture, hand the document back. The frame is _refreshing_ while it holds the borrowed document. Three at once at most, and that count is the whole of the pacing. _Avoid_: refresh queue, job

**Held**: A frame mounted behind its still so the Select tool has real DOM to read. An unreadable HTML selection stays held and keeps running; at readable size it resolves live, because Select must point at what is shown. This rejects cooperative pause and frozen pick geometry: entered frames already allow movement while Select owns the pointer, so neither a second runtime control nor stale geometry earns its complexity. A held terminal alone freezes, by SIGSTOP on its real process. _Avoid_: warm, paused

**Hands**: The human at the canvas. Hands own geometry and arrangement; agents own frame source. _Avoid_: user, designer

### Flows

**Flow map**: The arrow layer: the link graph derived by reading frame source. Walking can verify an edge, never add or remove one.

**Navigation site**: A place in frame source that navigates — a `data-go` attribute, a `ui.go(...)` call, or a terminal frame's `term.go(...)` call; each site's arrow grows out of its element.

**Certainty**: An arrow's claim: `will` (solid, unconditional site) or `might` (faint, the site sits inside a branch). _Avoid_: dashed arrows (retired)

**Unreadable**: A navigation site whose destination cannot be read from source. Never simulated and never drawn — it is reported by `spool flows` and to agents, where the fix is. A site the render answered — including by producing no attribute at all — is not unreadable, so an optional prop left undefined is no walk rather than a dark one.

**Walk**: Traversing navigation from an entered frame or in the player; a walk can flip a derived edge's verified mark.

**Scenario**: The `{state, mock}` seed a play session boots from; frames never branch on which scenario is active. _Avoid_: preset

**Mock**: The declarative layer answering a frame's relative fetches with named fixtures, per route. _Avoid_: stub

**Play session**: One run through the flows: name-stack history, state seeded from the scenario, reset on restart.

**Player**: The immersive standalone page that plays a flow as one composed document; phone-ready on a plain URL. _Avoid_: preview

### Agent surface

**Verbs**: The read-only agent CLI: `selection`, `flows`, `shot`, `logs`, `url`, `skill`. Agents author by writing frame files, never through a spool command.

**Selection**: What hands last pointed at, served to agents as read-only context: path, lines, selector, excerpt.

**Shot**: A headless, scenario-seeded screenshot of one frame in spool's own browser, never taken from the canvas.

**Skill**: The teaching text behind `spool skill`, under the completeness contract: if it is not in the skill, spool does not do it.

**Turn**: One exchange with the agent, from the prompt spool sends down its stdin to the terminal reason it answers with. The daemon spawns a process per turn and it dies with the turn. _Avoid_: run, session, request

**Spawn**: The developer's own installed agent, started by the daemon as a child process against the login already on the machine. Spool configures no key. What it takes is settled: the developer's settings only, the permission mode set explicitly, and one allow rule for edits under `design/`.

**Framing**: What spool appends to the agent's system prompt at spawn — five lines saying what the agent is for, plus `spool skill`'s overview taken from the same function the verb prints.

**Agent event**: One member of the internal union every adapter feeds and the rail renders. Modelled richest-first on what Claude Code emits; a type nobody modelled is carried rather than fatal. _Avoid_: message, chunk

**Adapter**: The translation from one runtime's wire format into agent events, and nothing else — it names no frames and parses no tool arguments. Claude Code's is the first; a second needs no rail change.

**Capture**: A recorded window of a real agent session under `fixtures/captures/`, read by both the shipped tests and the dogfood canvas. The captures are the authority: read one before drawing a state, and before claiming one is missing.

**Row**: One tool call in the transcript, as one line: a mark, a verb and a subject in spool's own nouns, with the path, command or wire name it stands in for behind a disclosure closed by default. Five states — pending, running, done, failed, stopped — where stopped is a call that never ran because a hand stopped it, told from failed by the wire's non-execution kind. The subject is the place where it names a frame: pressing it takes the canvas there, and a run's count sits outside that target because the count belongs to the call. A frame the project no longer has is struck and inert, and which frames those are is handed in rather than inferred. _Avoid_: log entry, event, message

**Plan**: The list a turn writes for itself, off the line and onto a strip above the log: one line carrying a count and the agent's own present-participle phrasing for whatever is running, opening into the tasks. It is the one thing that earns a place off the line, because it goes on changing after the call that wrote it — written in nine seconds, then moved across the next nine minutes and sixteen rows. Both phrasings are the agent's own, and a task nobody has started is the one thing in this rail that is pending. Per thread: a delegate's own list stays inside its own transcript. _Avoid_: todos, checklist, tasks pane

**Delegation**: A sub-agent as the transcript draws it: one row that expands into the delegate's own rows, so a fan-out is one line per delegate until somebody opens one. It settles on its task rather than on its own result, which is a launch receipt at 84ms, and it carries the runtime's live step while it runs. Its rows name frames and navigate like any other, because for a delegate the place is the canvas. _Avoid_: subtask, child turn, thread

**Run**: Consecutive writes to one frame drawn as one row with a climbing count (`edit home ×6`). The next thing the log draws ends it, per thread; time is never the rule, because gaps inside a run reach 15.2s while the shortest gap between two runs is 17.5s. _Avoid_: batch, group, collapse

### Laws

**Parity law**: Spool chrome must never alter frame behavior; a frame in spool behaves exactly like its bare document.

**Boundary law**: `shared/ui/` components have feel (own state) but never knowledge: no `"spool"` imports, props only. This is what keeps them product-importable.
