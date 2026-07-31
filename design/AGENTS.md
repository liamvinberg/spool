# spool canvas

This folder is a [spool](https://spool.page) project: live TSX frames on an infinite canvas — agents author the files, humans arrange and play them.

Run `pnpm dev skill` before working here — this repo's checkout CLI, never the installed `spool`. It is the complete contract: if it isn't in there, spool doesn't do it. Topics: `pnpm dev skill frames|flows|scenarios|mock|styling|verbs`.

- A frame is born by writing `frames/<page>/<name>/frame.tsx` default-exporting one React component — no registration, no `spool new`. Variants are `--`-named siblings (`checkout--empty/`).
- The one law: never write app-owned files — `canvas.json` and `.spool/` are spool's.
- Commit completed design work atomically before handoff.

## Voice

How spool talks, wherever words face a user — frames, chrome, the site, docs.

- One rule, two registers. If the machine would print it, it is verbatim lowercase mono: commands, paths, frame names, chips, counts, status lines (`live · esc exits`, `no frames yet`). If a person is saying it, it is a sentence: sentence case, proper nouns restored (Node, Chrome, TSX, GitHub), a period when it is a whole sentence.
- The name is "spool" in every register, sentence start included — wordmark, command and prose share the one form.
- Plain declaratives that carry their own proof ("It feels real because it is."). No hype adjectives, no exclamation marks, no em-dashes in copy.
- When the terminal is the subject, let it speak: the prompt names the working directory rather than a sentence saying "in your repo".
- A demo product on a frame speaks like a real product — its own name, its own sentence case — never in spool's costume.

## The pages

Every frame lives on a page; the root page stays empty on purpose.

| Page | What it holds |
| --- | --- |
| `app` | Spool as it shipped — home, the canvas, its context menu, the empty project, the player, the system sheet. Six frames, the core and nothing else. Walk it end to end: it is a working model of the product. |
| `agent` | The agent chat ([#114](https://github.com/liamvinberg/spool/issues/114)), decided. A wayfinder map resolved it over twenty-seven tickets, and on 2026-08-01 the page was swept to what won: **200 frames became 27.** Every losing variant and every decision sheet was deleted rather than kept beside its winner, because the reasoning lives in the tickets and the frames had stopped earning their keep — the last commit holding all of them is `444c39c`, and `git show 444c39c:design/frames/agent/<name>/frame.tsx` reads any of them back. Six were doing active harm: they still passed the value their own ticket argued *against* (`say="raw"` is the renderer [#148](https://github.com/liamvinberg/spool/issues/148) rejected), so a reader copying the nearest frame copied a loser.<br><br>**`agent-chat` is the compile** ([#180](https://github.com/liamvinberg/spool/issues/180)) and the frame to read first: every winner passing unconditionally, one component walked through eight captures by a mono picker below the app, no prop moving between them. It is where a winner stopped being an option and became the component. **`agent-hand` is the newest and the only one about the canvas rather than the rail** — see below.<br><br>Canonical, and the whole page: `agent-chat`, `agent-hand`, `agent-play` and its winners `--plan-pinned`, `--shot-open`, `--model-menu`, `--limit-line`, `--limit-stop`, `--threads-strip`, `--edit-run`, `--wall-install`, `--wall-login`, `--entered`, `--jump-name`, `--mcp-ask`, `--say-read`, `--ask-log`, `--ask-deny`, `--queue-box`, `--queue-back`, `--subagents`; `agent-say-pace` and `--jitter`; `agent-stop`; `agent-walk-ambient`, `--off`, `--dense`.<br><br>**What the tickets left in `shared/`**, which is where the decisions actually ship: `spool-say.tsx` renders an agent message and is used by the rail and both sheets; `say-markers.ts` closes a marker the message has not finished writing, which is what makes an animate-on-mount arrival safe at all; `say-pace.ts` sets the streaming rate off the backlog (`min(83 c/s, 250ms / pending)`) rather than off a fixed beat; `agent-queue.ts` owns the composer's queue, its fire and its take-back merge; `spool-lightbox.tsx` holds a `look` row's picture over the whole frame at life size, and needs no portal because every spool frame is its own document.<br><br>**`agent-hand` is the one open subject on this page.** It draws what the canvas does while the agent works a frame: the thread on the wall says what kind of hold this is, the node says the agent is here, the lane keeps the run's ledger, a plate tints the block a write just changed, and four corners strike for a `shot`. No words anywhere. It plays `claude-edits.json` across a phone and a desktop frame, and the finding that decides the implementation is that `LIVE_MIN_CSS_PX` (`src/cover.ts:8`) falls **between** them — a real phone needs 103% zoom to get a mounted document and a real desktop page needs 28%, so at every zoom anybody works at, a canvas holding both holds one live frame and one picture, and the located mark is obtainable on one and fictional on the other. Twenty-eight explorations and a comparison sheet are behind it in `444c39c`. [#214](https://github.com/liamvinberg/spool/issues/214) carries the grilling and the implementation findings — the short version is that `document.ts`'s `siteBoxes()` already resolves a `data-spool-source` stamp to a rectangle, so a plate needs no new runtime channel, and what is missing is upstream: nothing records which *lines* an `Edit` touched, and `events.ts` publishes `{kind: "frame", frame}` from a filesystem watcher, so the redraw is causally disconnected from the call that caused it. Still open: whether the lane and the plate are one channel drawn twice, and whether a mark may sit over the design at all.
| `site` | spool.page (#31), unbuilt. The hub and its four sections. |
| `directing` | The directing toolset (#56, #65), unbuilt. `directing--annotate` is the canonical frame the spec is written against. |
| `play-inline` | Whether play should zoom into the frame rather than open `/play/...` in a new tab. Nothing is decided: these are three transition characters over one mock canvas, built to be felt rather than argued. `play-inline--zoom` flies the camera and lets the stage cover what it left, `play-inline--lift` moves only the frame through a canvas that stays and dims, `play-inline--settle` flies like `--zoom` with the chrome dissolved first and the last 3% left to drift home. All three land on the identical player state, placed by `place()`'s own rule from `src/runtime/player-chrome.tsx`, so the landing is never what is being compared. Two things the frames establish whatever wins: the camera can carry the frame the whole way with nothing cross-fading, because the flight's landing values *are* the player's placement; and the counter-scaled label of `src/ui/canvas/frame-label.tsx` cannot ride a zoom, since it stays 12px while its frame grows to fill the viewport. Each frame is self-contained down to its own copy of `mock.tsx`. |

`app` is the baseline. A new prototype starts by copying the frame it changes,
not from nothing — so the thing being proposed is legible as a diff against
what exists.

Keeping it honest is the whole job. Every frame on `app` must match the code
in `src/ui/` and `src/runtime/`; when a design ships, the frame here becomes
what shipped. Read the implementation before trusting a frame — that is how
"design mode" survived here for months after select became the only pointer
tool. What the chrome is today: one 44px bar (brand lockup, project tabs, "+",
then threads toggle and zoom), the Pages rail at 248px, the agent rail at 420px
in a 200–480 range, and the tool bar floating over the bottom of the viewport.
No mode switch. Play lives on the selection. The agent rail is the transcript
and the composer (#192): the tab row, `elements` and `connections` are all gone.
The transcript holds the human's words, the agent's words, a beat for the wait,
and one line per tool call with its payload behind a closed disclosure (#193) —
runs of writes counted, `ask <Server>` for a connector, five row states. **#194
built what a row opens and where it goes**: the plan strip is on the shelf above
the log with a count and the agent's own `activeForm`, a screenshot is a real
120px thumbnail behind its row's disclosure that presses to life size, a frame's
name in a row navigates on `landOnFrame`'s own rule with the accent per row and
the run's count outside the target, a gone frame is struck off a `gone` set the
canvas hands in, and a sub-agent is one row that expands into its delegate's own
rows. **#195 landed the message itself**: it renders as markdown whole and
clamped never, arrives at the backlog's own rate with a word fading in at 170ms
behind a static caret, and leaves no element behind once it settles. A reply long
enough to be a document — four paragraphs or more — grows as it arrives rather
than reserving its height, on `agent-play--say-read`'s own rule, and stillness
draws it settled with nothing moving. **#196 landed what rides with the words**:
the composer draws the whole selection the daemon serves, one line of chips or a
count that opens into a droppable list, a chip's ✕ deselecting out on the canvas
and the entered frame's chip drawn at full strength with no ✕ at all; the prompt
carries one `<selection>` block, the same bytes `spool selection` now prints; the
transcript keeps the strip's own words under the human's; and a pasted or dropped
image rides as base64 with nothing written anywhere. **#197 landed the answering**:
the spawn wires its permission prompt to stdio, which is what makes an approval
data at all, so an approval draws under the row it is about carrying the agent's
own written description and takes allow, always or deny — always being the rule
the request suggested, moved to the thread's own scope and written to no file, and
absent where it suggested none. The agent's own question draws its options and
their whole descriptions in the log on `agent-play--ask-log`'s rule, with the
wordless `dismiss` of `--ask-deny` under them and the composer live beside them,
where Enter answers rather than sends. A question parks the turn and freezes its
clock until somebody acts; a connector's elicitation is declined and no dialog
kinds are declared. **#198 landed the stop and the queue**: `agent-stop`'s press
sits in the composer footer with its own `⎋`, esc from the field does the same and
esc from the canvas does it on the bottom rung of the ladder, once every rung above
it has passed; what goes down is an `interrupt` control request, so the process
survives it and the log ends on the wire's own `aborted_streaming` saying `stopped`,
and `[Request interrupted by user]` is never drawn. The stop is offered against
`phase === "playing"` and nothing else, because a parked turn has stopped by itself.
The queue is `agent-play--queue-box`'s: Enter while a turn runs holds the message in
a list spool owns, it stacks inside the composer's own border above the chip strip,
dimmed with a mono `queued` and a ✕, capped at 164px and scrolling inside itself,
and the whole stack goes down stdin as one turn the moment the result arrives with
each message carrying the `<selection>` entries from its own Enter. `--queue-back`'s
merge is the one invariant both exits share, in `agent-queue.ts`: words that leave
the queue un-fired land above the draft in fire order, one blank line apart.
**#200 landed the threads and what survives a restart**: the strip is a row above
the plan's shelf, the plus leading it, the open thread taking the room it needs
with its ✕ and the rest collapsed to a mark with theirs, and a press centring the
row on what was pressed. It draws #161's marks at ship size. `streaming`
drew nothing at first, on the reading that a ring for the thread you are
watching is a second spinner saying what the transcript already says — which
held while the marks sat in a row of named tabs. #205 moved them into a 34px
column where the cell is the whole of the thread, the same ground that already
earns `read` its hollow dot, and `f0eff75` turned the ring there: all five
lives draw now, and the frames here were right about this one all along. A collapsed
`read` thread keeps `agent-nav-strip`'s hollow dot, because out there the mark is
the thread. A signed-out bounce shares the waiting disc, read off the binary's own
words now that a printed refusal reaches the log; a wind-down does not. The
picture is one file per thread under the state directory, written on every
boundary and on a 2s throttle while a turn runs, and the thread id is the session
id the spawn resumes — so a conversation keeps every turn and a restored thread is
byte-identical to what was drawn. A restart cuts the picture where the lights went
out and offers no resume, an aged-out session reads finished, and a ✕ deletes
nothing. **What the frames here still draw ahead of the code**: `--threads-strip`'s
equal-width tabs and its missing ✕, which #136 already recorded as the frame
lagging its own decision.
**#199 landed the model, its effort and the usage window**: the footer's send hint is
gone and `agent-play--model-menu`'s trigger has its slot, populated by a real
`list_models` control request per open rather than by anything shipped — one probe
spawn in `agent-offer.ts` asks the control request and a bare `/model` in the same
process, for no turn and no token, and answers both what may be picked and what is
answering. A press is #186's `one sentence`: names one line each and a
single slot describing whatever the cursor is on, reserving its tallest sentence
because the panel opens upward. Effort comes off the picked row's own
`supportedEffortLevels`, so `haiku` draws no control at all. **What the frames could
not show is that a pick has to survive the process it was made in**: a pick sends the
message, keeps only what the reply confirmed, and hands that to every later spawn of
that thread as `--model` / `--effort` — which is also why the environment still wins,
since `--effort` was measured to outrank `CLAUDE_CODE_EFFORT_LEVEL` while `/effort` is
refused by it, and spool only ever passes a flag the binary already agreed to. The ask
is a thread's rather than a project's, on #200's own reading: the rows come back the
same for every thread and which of them is answering does not. The probe carries no
thread at all, because `/model haiku` is a local command the runtime records in
whatever session it lands in, and the menu's plumbing must not reach the transcript.
#184's row is the model and the stop and nothing else, the name truncating and never
shortening, and #200's own word about a finished thread moved into the field's
placeholder to make room. #122's window renders whole inside the menu at every rail
width, clamped to the composer rather than cut off by the rail, absent until the binary
warns, with nothing about overage and one rule across the log for the wind-down.
**#201 landed the two ways there is no agent to talk to**, as the two shapes
`--wall-install` and `--wall-login` drew them. A missing binary is a wall in the
transcript's place before the first keystroke, with the composer present and dead;
it is answered by a `which` over the same bare name a spawn resolves, asked when the
rail opens, and its look may keep failing and says so in one quiet line each time. A
door that said nothing draws no wall, because a wall is spool saying it looked. The
threads row goes with the transcript there, since a conversation you cannot continue
is not something to switch to. Signed out is a strip on the shelf the plan would take
plus the bounce in the log, found out by spawning, with the binary's own refusal
verbatim and one sentence of spool's under it — the frames' own `LOGIN_REMEDY` and
the promise about keys, as the second note shape this rail has ever had. **The check
is `claude auth status --json`**, which is the frames' preflight made real and the
only instrument that names an account without spool reading a private file: the
frames read `oauthAccount` off `~/.claude.json`, which the ticket forbids, and the
binary answers `loggedIn` and an `email` itself in 0.31s. On a yes it names the
account once and re-sends the held prompt with the turn drawing no second copy of it;
on a no it leaves one quiet line and sends nothing, which the frames never drew
because their check always passed. **One defect fell out of building the way back**:
#161's mark and this strip both read the bounce off the log, and reading the whole
conversation left an archived refusal saying *stuck* forever on a thread that had
recovered — so both now read the turn that ran, which also means a restored thread
draws neither, having no held prompt to run and nothing waiting on anybody.

Explorations live until the work they decided is built. Making the decision is
not that moment: while a page is still being resolved, the rejected frames are
what the next session reads to see what was already argued and why, and a
component only the loser references dies with it. When the work ships, the
winner moves onto `app` as what shipped and the rest are deleted then. Git
history is the archive, and `git log --diff-filter=D --stat -- design/frames`
finds them.
