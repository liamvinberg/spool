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

### Canvas

**Canvas**: The infinite surface where frames are arranged; a projection of the disk, never a source of truth. _Avoid_: board

**Page**: A one-level subfolder of `design/frames/` grouping frames into a journey; each page is its own canvas. The flat top level is the permanent root page, and frame names stay unique across the whole project. _Avoid_: group, section, sub-page

**Portal**: The chip drawn where a link leaves the active page — no arrow can reach the target, so the marker names it and its page, and activating it jumps there.

**Select**: The default and only pointer tool: a click takes the frame to arrange it, a double-click enters it, and holding the platform modifier takes the element under the cursor instead. Selecting a readable HTML frame leaves it visible and running while Select owns the pointer; an unreadable selection stays held behind its still. _Avoid_: interact

**Hand**: The canvas tool for panning with a primary-button drag; holding Space borrows it temporarily.

**Entered**: The state of a frame after a double-click: pointer and keyboard input belong to its app, and walks happen in place. Esc leaves an html frame. A terminal frame currently has no TUI keyboard session because it renders a static disabled surface; the platform modifier + Esc still leaves it. Holding the platform modifier hands the pointer back so an element can be reached; the frame keeps painting, because you are still looking at it. _Avoid_: focused, interact

**Still**: The stored picture of a frame, taken by the frame itself once it has finished arriving — its own fonts, its content settled. It is what the canvas draws below a readable size, and it covers a frame until its document boots. A still is a placeholder, not an artifact: it stands in below 400 CSS px drawn width; above that, a nearby frame is live. _Avoid_: screenshot, snapshot

**Ladder**: What a still is stored as: several **rungs** of one picture, the top at the frame's long edge doubled and each below it half the one above, addressed together by one hash of their content. The frame's geometry sets the sizes, never the display that photographed it. The canvas names the rung a zoom asks for, because only the canvas can see the camera. A short ladder is a normal cover — the headless fallback can only make its bottom rung. _Avoid_: variant, size, resolution

**Picture**: A frame below readable size or outside the viewport ring: its still on screen and no document behind it, for as long as nothing asks for one. _Avoid_: hibernated, unmounted, cold

**Caused mounting**: Why a frame holds a document at all: you went inside it, its picture is missing, its picture is wrong, or it draws at least 400 CSS px wide inside a viewport expanded by 25% on every side. The readable condition bounds documents by viewport area rather than frame count. Intent holds a document too, one frame at a time: the selection target and the frame an open inspector rail reads. _Avoid_: warm pool, wake queue, hibernation

**Errand**: The canvas borrowing a frame to photograph it — mount out of sight behind its own still, run, capture, hand the document back. The frame is _refreshing_ while it holds the borrowed document. Three at once at most, and that count is the whole of the pacing. _Avoid_: refresh queue, job

**Held**: A frame mounted behind its still so the Select tool and inspector rail have real DOM to read. An unreadable HTML selection stays held and keeps running; at readable size it resolves live, because Select must point at what is shown. This rejects cooperative pause and frozen pick geometry: entered frames already allow movement while Select owns the pointer, so neither a second runtime control nor stale geometry earns its complexity. A held terminal alone freezes, by SIGSTOP on its real process. _Avoid_: warm, paused

**Inspector rail**: The right rail reading the selected frame, closed by default and summoned only from the header pill. Two tabs: `elements` (the frame's named rows) and `connections` (its whole outbound list). Sticky both ways — selection never opens or closes it. _Avoid_: panel, properties

**Named row**: An element the inspector lists: a component boundary, a call-site (with its `[n]` instances beneath it), or an element carrying text or an accessible label. Anonymous wrappers are not rows; their children promote to the nearest named one, so depth reads as authored depth.

**Hands**: The human at the canvas. Hands own geometry and arrangement; agents own frame source. _Avoid_: user, designer

### Flows

**Flow map**: The arrow layer: the link graph derived by reading frame source. Walking can verify an edge, never add or remove one.

**Navigation site**: A place in frame source that navigates — a `data-go` attribute, a `ui.go(...)` call, or a terminal frame's `term.go(...)` call; each site's arrow grows out of its element.

**Certainty**: An arrow's claim: `will` (solid, unconditional site) or `might` (faint, the site sits inside a branch). _Avoid_: dashed arrows (retired)

**Unreadable**: A navigation site whose destination cannot be read from source; flagged by `spool flows`, never drawn, never simulated.

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

### Laws

**Parity law**: Spool chrome must never alter frame behavior; a frame in spool behaves exactly like its bare document.

**Boundary law**: `shared/ui/` components have feel (own state) but never knowledge: no `"spool"` imports, props only. This is what keeps them product-importable.
