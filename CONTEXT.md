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

**Asset**: A project file whose bytes ride inside the served document instead of being fetched: an image or text file a frame imports, or a font `shared/fonts.css` names by a relative `url()`. There is no asset route and no asset URL, and the import is what puts the file in a frame's closure. _Avoid_: static file, public folder

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

**Player**: The surface that plays a flow as one composed document, fitted edge to edge and carrying one pill. Its human door is inline play; the standalone `/play/` page is the same player for agents and phones, phone-ready on a plain URL. _Avoid_: preview

**Inline play**: Play on the canvas: the camera flies into the frame until it fills the screen, the player takes the viewport in a sandboxed layer, and `accel+esc` flies back out of whichever frame the walk ended on. The canvas takes the whole window for the length of a flight and its furniture dissolves, so the zoom crosses the top bar and the rails rather than sliding under them. Not a URL — a refresh returns to the canvas, like the camera and the selection.

**Pill**: The player's only chrome: the frame's name and three controls, restart, fullscreen and close. It shows itself once on arrival and then stays gone until the pointer reaches the strip it lives in, so it is never sitting on a prototype's own footer while the prototype is being used. _Avoid_: toolbar, HUD, overlay

**Accel**: The one modifier a platform binds its own commands to: cmd on Apple, ctrl everywhere else, never a hardcoded meta key. Spool's own gestures all live behind it, because spool never takes a plain key from a live frame — every ordinary key belongs to the prototype being used, its own `esc` included.

### Agent surface

**Verbs**: The read-only agent CLI: `selection`, `flows`, `shot`, `logs`, `url`, `skill`. Agents author by writing frame files, never through a spool command.

**Selection**: What hands last pointed at, served to agents as read-only context: always a list, frames or elements, each with its path and — for an element — what the source calls it, the lines it spans, its selector and its excerpt.

**Selection block**: The selection as one block of text, and the only rendering of it: the bytes `spool selection` prints are the bytes a turn's prompt carries for the same moment, so a CLI agent and the agent in the rail read one contract. Every entry always contributes its pointer and only excerpts are ever elided, which the block states when it happens. Nothing pointed at prints nothing, because an empty block would be a shape claiming the moment had one. _Avoid_: context payload, prompt preamble

**Chip**: One entry of the selection in the composer, riding out with the message without being asked for. The strip takes one line of the composer and never two: either every chip fits or it is a count that opens into a droppable list, and there is no third shape. A chip's dismiss control deselects on the canvas, because two picks of one list row are one string in the rail and two boxes out there. The frame the hands stepped into is an ordinary chip with the control taken off, at full strength. _Avoid_: pill, tag, token

**Attachment**: A reference image riding with a prompt as base64 over the stdin the turn already opens. Look-only: nothing is written, so the app-owned folder gains no inbox, no lifetime and no deleter, and the agent's own transcript is the durable copy. A browser never reveals a dropped file's path, which is why adding an asset stays a deliberate import into `design/shared/assets/`. It arrives by paste or drop, and its receipt is the picture under the words in the transcript. _Avoid_: upload, file

**Shot**: A headless, scenario-seeded screenshot of one frame in spool's own browser, never taken from the canvas.

**Skill**: The teaching text behind `spool skill`, under the completeness contract: if it is not in the skill, spool does not do it.

**Turn**: One exchange with the agent, from the prompt spool sends down its stdin to the terminal reason it answers with. The daemon spawns a process per turn and it dies with the turn. _Avoid_: run, session, request

**Spawn**: The developer's own installed agent, started by the daemon as a child process against the login already on the machine. Spool configures no key. What it takes is settled: the developer's settings only, the permission mode set explicitly, and one allow rule for edits under `design/`.

**Framing**: What spool appends to the agent's system prompt at spawn — five lines saying what the agent is for, plus `spool skill`'s overview taken from the same function the verb prints.

**Agent event**: One member of the internal union every adapter feeds and the rail renders. Modelled richest-first on what Claude Code emits; a type nobody modelled is carried rather than fatal. _Avoid_: message, chunk

**Adapter**: The translation from one runtime's wire format into agent events, and nothing else — it names no frames and parses no tool arguments. Claude Code's is the first; a second needs no rail change.

**Capture**: A recorded window of a real agent session under `fixtures/captures/`, read by both the shipped tests and the dogfood canvas. The captures are the authority: read one before drawing a state, and before claiming one is missing.

**Prose**: The agent's own words in the transcript, rendered as markdown and never clamped — a message has no call to outlive, and rendered, the thing that makes it long is the thing that makes it skimmable. The subset is the corpus's: bold, inline code, fenced blocks, blockquotes and both list kinds, and no headings, because no message that reaches a log has one. A marker the message has not finished writing is closed rather than held back, and a lone bullet or number waits for its space, so what is drawn is always a prefix of what will be drawn. A settled word leaves no element behind; the arriving window is the only thing wrapped. _Avoid_: message, bubble, assistant text

**Pace**: When a character of an arriving message is allowed on screen — one every `min(12ms, 250ms ÷ pending)`, so the further behind the edge is the faster it moves and the floor is 83 characters a second. A closed form over the delta schedule rather than an accumulator, never ahead of the wire and never unwriting a character, costing up to 0.8s of lag and finishing 0.26s after the last delta. A word fades in at 170ms on arrival and the caret at the live edge is static, because every fade completes during a pause. Stillness is a jump cut rather than a slower one. _Avoid_: typewriter, throttle, animation speed

**Row**: One tool call in the transcript, as one line: a mark, a verb and a subject in spool's own nouns, with the path, command or wire name it stands in for behind a disclosure closed by default. Five states — pending, running, done, failed, stopped — where stopped is a call that never ran because a hand stopped it, told from failed by the wire's non-execution kind. The subject is the place where it names a frame: pressing it takes the canvas there, and a run's count sits outside that target because the count belongs to the call. A frame the project no longer has is struck and inert, and which frames those are is handed in rather than inferred. _Avoid_: log entry, event, message

**Plan**: The list a turn writes for itself, off the line and onto a strip above the log: one line carrying a count and the agent's own present-participle phrasing for whatever is running, opening into the tasks. It is the one thing that earns a place off the line, because it goes on changing after the call that wrote it — written in nine seconds, then moved across the next nine minutes and sixteen rows. Both phrasings are the agent's own, and a task nobody has started is the one thing in this rail that is pending. Per thread: a delegate's own list stays inside its own transcript. _Avoid_: todos, checklist, tasks pane

**Delegation**: A sub-agent as the transcript draws it: one row that expands into the delegate's own rows, so a fan-out is one line per delegate until somebody opens one. It settles on its task rather than on its own result, which is a launch receipt at 84ms, and it carries the runtime's live step while it runs. Its rows name frames and navigate like any other, because for a delegate the place is the canvas. _Avoid_: subtask, child turn, thread

**Run**: Consecutive writes to one frame drawn as one row with a climbing count (`edit home ×6`). The next thing the log draws ends it, per thread; time is never the rule, because gaps inside a run reach 15.2s while the shortest gap between two runs is 17.5s. _Avoid_: batch, group, collapse

**Ask**: The turn waiting on the person, which is the one state in this rail that ends when somebody acts rather than when something arrives. An approval and the agent's own question ride one control request and are told apart by a flag on it: an approval leads with the agent's own written description and takes allow, always or deny, and a question leads with its own options and their whole descriptions and takes a pick, a sentence typed in the composer, or a wordless dismiss. Prose is a first-class answer the runtime prefers. An ask parks the turn and stops the clock, and nothing spool runs ever answers one or expires it. A connector's structured elicitation is declined instead, and no dialog kinds are declared, so a generic dialog is never received. _Avoid_: permission prompt, modal, confirmation

**Always**: An approval answered for the rest of the thread, using the rules the request suggested for itself moved to the runtime's own thread scope. Written to no file, because the complaint is repetition rather than a missing permanent grant, and absent rather than dead where the request suggested no rule — spool composes none of its own. _Avoid_: remember, don't ask again, grant

**Stop**: The way out of a turn already in flight: a press in the composer footer and esc, both sending an interrupt control request up the same stdin the prompt went down. It is the one thing spool asks the runtime for rather than answers, and it is a request rather than a kill — the process survives it, hands the call it caught a synthetic rejection, and emits a clean result, so nothing on disk is torn. What it catches is neither done nor failed but stopped, and the log says so in spool's own word; the runtime's own interruption notice is never drawn, because it is addressed to the model rather than to anybody. Offered against a running turn only: a parked one has stopped by itself and its exit is the ask's own dismiss. A stop cancels the queue and leaves the thread unmarked, because a person stopped it and nothing is waiting on anybody. A client going away is not a Stop and does not share its path: nobody is reading the answer, so that process is killed rather than asked. _Avoid_: cancel, abort, kill

**Queue**: The messages spool holds while a turn runs, held by spool rather than by the runtime — take-back has no wire, every adapter queues alike, and the rail draws its own state rather than a picture of another process's. Enter accepts a message into the list and writes nothing mid-turn; the whole list goes down stdin the moment the result arrives, in order, as one turn, each message carrying the selection block from its own Enter rather than from firing time. It stacks inside the composer above the chip strip, dimmed with a mono `queued` and a take-back, because a message committed and not sent has not happened and so never leaves the surface your words live on. One invariant covers both exits: words that leave the queue un-fired land back in the box, above the draft, in fire order, one blank line apart — so a stop and a take-back have the same outcome for the words involved. _Avoid_: outbox, buffer, pending messages

**Thread**: One conversation in a project, which is a session id and what spool stored of it. Not bound to a page — a cleanup writes across many pages or none — so switching one moves nothing on the canvas, and a project holds as many as somebody starts, every one of them still running when nobody is watching. Its name is the frames it wrote, two of them and then a count, derived on every read and stored nowhere: an ask is a sentence and a name is a label, so naming a thread after the ask made every name a truncation. A thread that has written nothing is still its ask, because this is a better name where there is one rather than a different fallback. Nothing is borrowed and nothing is generated: the runtime's own title never reaches print mode, and spool spending a model call on a label is silent spend. Derived names collide and are left to collide: two threads that both edited `home` are both called `home`, and under a column of marks with one nameplate there is no list for the collision to bite in. The id is minted before there is a process, handed over as the session id and used to resume it, so the id wins whenever it and the store disagree. _Avoid_: session, chat, conversation tab

**Life**: What a thread's 14px mark says, in five readings of which four draw. Streaming draws nothing and keeps the cell aligned; running turns; waiting is unread's disc held inside running's ring, the loudest of the three because it is the only one actually stuck; unread is a solid dot at text strength; read is a hollow one, because out in the column the mark is the whole of the thread and a thread you cannot see is one you cannot press. Colourless throughout, because state in this rail is motion and the one accent belongs to the selection. Waiting and unread are told apart by what clears them: a look clears unread wherever the looking happened, and nothing about looking answers a question. Its three causes — a parked question, an unanswered approval, a login that is not there — share the one mark; a usage wind-down is not one of them. _Avoid_: status, badge, indicator

**Spine**: The threads as a column down the rail's outer edge: the plus at the top, one 34px cell per conversation in recency order, the open one carrying the accent. It stands on the outer edge because the inner one is the drag handle and the outer one is where a shut rail already lives, so the two want the same edge rather than two different ones; the shut strip itself draws no threads, because shutting the rail is asking for the canvas back. What it costs does not move with the number of threads, which is the whole of why it turned: a row of names ran out at four and a column of marks has the axis a rail has spare. Nothing in it is a name — the thread under the pointer arrives to the left of the cell over the log, with its name, the last line it drew, its age and its ✕, which has nowhere else to be in 34px — and the thread you are in is named once on a nameplate above the log, which is a label rather than a control because names are derived. _Avoid_: sidebar, tab rail, switcher

**Store**: What spool keeps of a thread, in its own state directory, one file per thread: exactly the entries the rail drew, plus the ask, the life and the plan. Never the stream — one turn is 236 events and a session 2.3 MB — and never a lossy tier, so live and restored are one view with a 120px thumbnail the only real bytes. Written because a daemon restart is routine rather than rare, and needed at all because resuming a session restores the agent's memory and emits no history. It carries no clock: a message's arrival schedule belongs to the turn that streamed it, so what comes back is drawn whole. A restart marks a thread stopped and never resumes it; a session that has aged out leaves the record readable and the thread finished; closing a thread deletes neither. _Avoid_: history, transcript file, cache

**Offer**: What the runtime says one thread may pick, asked of it at runtime and shipped in no table: one control request answers with its own rows, each carrying its name, its sentence and its own effort levels, so a new or retired model needs no spool release. It answers with the choices it offers rather than every alias it accepts, which is what leaves one axis — no models-versus-policies split, and a wider context window as one row rather than a model with a switch beside it. A model with no levels has no effort control at all, because the absence is data. The rows come back the same for every thread and which of them is answering does not, so the ask is a thread's and switching one re-asks. _Avoid_: model list, catalogue, registry

**Readout**: Which machine is answering and how hard it is thinking, drawn from the runtime's own report and never from what spool asked for — a control that renders its own state is guessing, and this one can be overruled by an alias the runtime will not take or an effort level the environment holds. The name is the runtime's own, uncased and unshortened: it truncates with an ellipsis and is never rewritten, because two offered rows can resolve to one model with only a parenthetical between them, so a shortened name is not a short name for this machine but the correct name of a different one. Choosing is a shortcut for the message a person could type, so both go the same way and neither is a second source of truth, and the choice is the thread's: it rides every spawn of that thread as a flag, because a resume restores the conversation and a command typed into one turn is a fact about that turn. _Avoid_: model picker, selected model, current settings

**Usage window**: The one usage limit the runtime hands over, out of the six it can name — spool picks neither the window nor the threshold, both are chosen upstream by representative claim and then by a burn-rate table spool does not own. It lives in the model menu rather than beside it, because the remedy for reaching one is a model switch every time and the fact belongs next to the remedy. Absent until the runtime warns: below that the payload carries no utilization at all, so there is no gauge to draw and the line cannot become chrome. Reaching one is a wind-down rather than a wall — the agent is told to finish or checkpoint and start nothing new, which is why the log says so, and the failure mode is a turn that half happened. Nothing is drawn about overage, which is billing spool has no relationship to narrate. _Avoid_: quota, rate limit bar, usage meter

**Wall**: What the rail is when there is no runtime on the machine to spawn: a sentence in the transcript's place, before the first keystroke, because whether a command resolves on PATH is a fact about this machine that spool owns the right to look up, that costs nothing to answer and that is stable. The composer stays and is dead — take it away and the rail is a sentence with no evidence of what the rail is for, leave it live and it collects a prompt for nobody. Its look is allowed to keep failing, because installing takes minutes rather than the second a login takes, so a second press is the normal case and each one leaves a quiet line. Only a look that came back and found nothing draws it: a door that said nothing is not a machine with nothing on it. Colourless, because the one accent means a chip and a box are one object and this is not even a failure. _Avoid_: error state, empty state, setup screen

**Bounce**: A turn that came back refused because nobody is signed in. Whether a runtime is signed in is a fact inside another product, and spool reads none of its private credential or config files to find out — it asks by spawning, which is the thing it was going to do anyway, so the refusal lands when the first token would have rather than instantly, and a composer that refused before sending would be spool guessing wrong the first morning somebody signs in without telling it. It reads in two places on the one test that separates them: the standing fact is a strip on the shelf the plan would take, since a plan belongs to a turn that is running and this exists because none can, and the moment itself is in the log, in the runtime's own refusal wording verbatim with one sentence of spool's under it naming the terminal, because the runtime's own remedy is a slash command inside a session spool does not spawn. The words that bounced are kept: they are in the log in the human's voice from the instant Enter was pressed, checking again sends those same words, and the turn draws no second copy of them. The check asks the runtime and answers with a who, said once at the moment spool starts using that login; a check that comes back with the same answer leaves one quiet line. Nothing anywhere is drawn about API keys and no field exists to paste one into. _Avoid_: auth error, login screen, sign-in prompt

### Laws

**Parity law**: Spool chrome must never alter frame behavior; a frame in spool behaves exactly like its bare document.

**Boundary law**: `shared/ui/` components have feel (own state) but never knowledge: no `"spool"` imports, props only. This is what keeps them product-importable.
