# spool

Spool is a local-first prototyping canvas: agents author live TSX frames on disk; people arrange them spatially and walk the flows between them. One context for the whole repo; these terms are canonical in issues, specs, tests, and code.

## Language

### System

**Project**: A product repo's `design/` folder as spool knows it, registered only by explicit `init` or `open`, never by scanning. _Avoid_: workspace

**Daemon**: The one per-machine local server every spool surface is served from.

**Frame**: A folder under `design/frames/<name>/` holding one entry file — `frame.tsx` (html) or `term.tsx` (terminal); the unit prototypes are made of. The entry filename is the kind, and a folder holding both is a discovery error. _Avoid_: screen, artboard, mockup

**Terminal frame**: A frame whose `term.tsx` is an OpenTUI app the daemon runs as a real process in a PTY; the canvas paints its cell grid live, and it is sized, frozen, and stilled in whole cells. The second and final frame kind.

**Variant**: A frame whose `--`-suffixed name marks it as an alternative take on its base frame (`home--empty`).

**Geometry sidecar**: The app-owned `frame.json` beside a frame's source, holding its place and size on the canvas. _Avoid_: layout file

### Canvas

**Canvas**: The infinite surface where frames are arranged; a projection of the disk, never a source of truth. _Avoid_: board

**Page**: A one-level subfolder of `design/frames/` grouping frames into a journey; each page is its own canvas. The flat top level is the permanent root page, and frame names stay unique across the whole project. _Avoid_: group, section, sub-page

**Portal**: The chip drawn where a link leaves the active page — no arrow can reach the target, so the marker names it and its page, and activating it jumps there.

**Select**: The default and only pointer tool: a click takes the frame to arrange it, a double-click enters it, and holding the platform modifier takes the element under the cursor instead. Selecting into one frame freezes that frame in place; the rest keep their normal lifecycle. _Avoid_: interact

**Hand**: The canvas tool for panning with a primary-button drag; holding Space borrows it temporarily.

**Entered**: The state of a frame after a double-click: pointer and keyboard input belong to its app, and walks happen in place. Esc leaves an html frame; a terminal owns every key, so the platform modifier + Esc leaves it. Holding the platform modifier freezes the entered frame and hands the pointer back so an element can be reached. _Avoid_: focused, interact

**Hibernated**: A frame demoted to its still because the warm pool overflowed; it boots fresh on return. Hibernation's payoff is memory, never CPU. _Avoid_: paused

**Warm pool**: The bounded set of offscreen frames kept mounted with time frozen; overflowing it, oldest-seen first, is the only path into hibernation. The frozen frame and the one an open inspector rail reads are current intent and never overflow. _Avoid_: cache

**Wake queue**: The single ordered path a frame takes into the DOM, drained a few mounts per sweep — an entered frame starts immediately, then the frozen selection target and the frame the inspector rail reads, then visible frames nearest the viewport center. Zoom and page-entry bursts drain through it.

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
