> Research asset resolving issue #2 (`wayfinder:research`), dated 2026-07-20. Verdict tags are suggestions only — Liam decides in his review session.

# Pattern and idea sweep

## Patterns

### Canvas gestures and keybinds

- **Nothing-selected pan** — Figma pans the canvas with plain arrow keys when nothing is selected, Shift+arrow for a bigger step, no modifier required. [Figma keyboard shortcuts](https://help.figma.com/hc/en-us/articles/360040328653-Keyboard-shortcuts-in-Figma-Design) [adopt-v1]
- **Modifier zoom** — Figma zooms with Cmd/Ctrl plus `+`/`-`; keyboard controls are enabled by default for everyone and cannot be disabled. [Figma keyboard shortcuts](https://help.figma.com/hc/en-us/articles/360040328653-Keyboard-shortcuts-in-Figma-Design) [adopt-v1]
- **Inline preview shortcut** — Shift+Space or a flow-icon click drops into live inline preview right next to the canvas, with R restarting the run and arrow keys for prior/next. [Play your prototypes](https://help.figma.com/hc/en-us/articles/360040318013-Play-your-prototypes) [adopt-v1]
- **Dedicated link-mode key** — Magic Patterns puts a whole-canvas mode switch on a single key (P) rather than a toolbar click, so linking two screens is keyboard-first. [Prototyping docs](https://www.magicpatterns.com/docs/documentation/projects/prototyping) [adopt-v1]
- **No dblclick/right-click overload** — Figma deliberately ships no double-click or right-click prototype triggers, keeping those gestures reserved for canvas-editing verbs instead of frame-level behavior. [Prototype triggers](https://help.figma.com/hc/en-us/articles/360040035834-Prototype-triggers) / [feature request thread](https://forum.figma.com/suggest-a-feature-11/right-click-and-double-click-triggers-for-prototypes-10499) [adopt-v1]
- **Single-key-first, palette-fallback** — Linear routes nearly every action through a bare single-key shortcut and treats Cmd+K as the fallback for everything else, so the mouse is always optional; this is general product knowledge, not independently re-verified via fetch this session. [later]

### Frame/artboard chrome

- **Rotating name header** — tldraw's frame heading sits above whichever edge is currently "up" and rotates with the frame so it stays readable; double-click to rename. [tldraw frame shape docs](https://tldraw.dev/sdk-features/frame-shape) [adopt-v1]
- **Visual-only clipping** — tldraw clips a frame's children to its bounds for rendering only; geometry and hit-testing underneath stay untouched, so a clipped child is still fully selectable/editable. [tldraw frame shape docs](https://tldraw.dev/sdk-features/frame-shape) [adopt-v1]
- **Blue-flag starting points** — Figma marks a flow's entry point with a small draggable blue flag icon pinned to the frame, a distinct glyph decoupled from the frame's own selection outline. [Create and manage prototype flows](https://help.figma.com/hc/en-us/articles/360039823894-Create-and-manage-prototype-flows) [adopt-v1]
- **One name, three surfaces** — a Figma frame's label doubles as its Flows-panel entry and its Presentation-view title, so naming a frame once updates navigation everywhere it's referenced. [Create and manage prototype flows](https://help.figma.com/hc/en-us/articles/360039823894-Create-and-manage-prototype-flows) [adopt-v1]
- **Zero chrome gap** — Framer Code Components render identically on the canvas, in Preview, and on the published site, so there's no separate "design-time" appearance to keep in sync with the real one. [Code Components docs](https://www.framer.com/developers/components-introduction) [adopt-v1]
- **DevTools-style selection** — Onlook's whole interaction model is explicitly "manipulate the DOM like a Chrome DevTool," reusing a gesture vocabulary users already have instead of inventing a new one. [Onlook architecture docs](https://docs.onlook.com/developers/architecture) [adopt-v1]

### Panel and inspector layouts

- **Flows panel as its own nav surface** — Figma's Flows panel lists every named starting point with one-click jump-to, entirely decoupled from the layers/structure panel. [Create and manage prototype flows](https://help.figma.com/hc/en-us/articles/360039823894-Create-and-manage-prototype-flows) [adopt-v1]
- **Terse view forks for agents** — Paper's `get_tree_summary` MCP tool returns a compact subtree hierarchy purpose-built for agent consumption, distinct from the verbose per-node calls a human-facing inspector would use. [Paper MCP docs](https://paper.design/docs/mcp) [adopt-v1]
- **Bound-vs-static side by side** — once a Rive View Model is attached, its inspector shows which fields are data-bound versus static in the same panel as ordinary scene properties. [Data Binding Overview](https://rive.app/docs/editor/data-binding/overview) [later]
- **Click-to-expose parameter** — Origami turns any inspector property into a graph input/output the moment you click it, collapsing "static value" and "wireable parameter" into one shared list; the underlying patch-graph model itself is already a rejected direction for spool. [Origami patches](https://origami.design/documentation/patch-editor/patches) [skip]
- **Inline, response-scoped timelines** — ProtoPie shows timing (duration, start delay) as a small draggable bar inside each response's own row in the inspector rather than one global timeline, so timing UI only appears where it's locally relevant; ProtoPie's broader trigger/response machinery is already out of scope since code subsumes it. [Timelines](https://www.protopie.io/learn/docs/interactions/timelines) [skip]

### Flow-arrow rendering and linking gestures

- **Four-step linking gesture** — Magic Patterns: press P, hover an element until it highlights, click it, click the destination screen, and an arrow draws itself between the two screen thumbnails. [Prototyping docs](https://www.magicpatterns.com/docs/documentation/projects/prototyping) [adopt-v1]
- **Flows are inferred, not declared** — a Figma flow auto-creates itself the first time two previously unconnected frames get any connection; nobody pre-declares "this is Flow 1" before wiring it. [Create and manage prototype flows](https://help.figma.com/hc/en-us/articles/360039823894-Create-and-manage-prototype-flows) [adopt-v1]
- **Flows overlap, they don't partition** — one Figma frame can belong to multiple flows at once, and reaching it via any flow unlocks all of its outgoing interactions regardless of entry path. [Create and manage prototype flows](https://help.figma.com/hc/en-us/articles/360039823894-Create-and-manage-prototype-flows) [adopt-v1]
- **History-invisible lateral links** — Figma's Swap-overlay action inherits the replaced overlay's position/settings and is deliberately not recorded in navigation history, so Back skips over it — a precedent for lateral/tab-like links that shouldn't push onto a back-stack. [Prototype actions](https://help.figma.com/hc/en-us/articles/360040035874-Prototype-actions) [later]
- **Arrows encode boolean logic by how they're drawn** — Rive: two separate transition arrows between the same state pair mean OR, while stacking multiple conditions on one arrow means AND; a documented drawing convention for fan-out even though Rive's state-machine model itself isn't being adopted. [Transitions](https://rive.app/docs/editor/state-machine/transitions) [skip]
- **Bound, auto-updating arrows** — tldraw arrows bind to shapes and auto-update their endpoints on move, with arc/elbow routing and multiple arrowhead styles shipped by default. [tldraw canvas features](https://tldraw.dev/sdk-features/snapping) [adopt-v1]

### Play/preview mode entry and exit

- **Immediate vs. detached preview** — Figma's inline Preview reflects live design edits instantly because it's the same document, while full Presentation view opens a separate tab that does not update live — trading immediacy for a clean, demo-ready surface. [Play your prototypes](https://help.figma.com/hc/en-us/articles/360040318013-Play-your-prototypes) [adopt-v1]
- **URL-param kiosk mode** — Figma Presentation view strips all chrome via a `&hide-ui=1` URL parameter, and paid plans can additionally hide the "Open in editor" escape hatch on shared links. [Set prototype device and background settings](https://help.figma.com/hc/en-us/articles/21158597546391-Set-prototype-device-and-background-settings) [later]
- **Thumbnail-then-hydrate** — Figma Make embeds render as a static preview thumbnail by default; only an explicit Play-button click hydrates them into the real interactive, scrollable/clickable embed. [Introducing Figma Make embeds](https://www.figma.com/blog/introducing-figma-make-embeds/) [adopt-v1]
- **One button, whole-canvas mode switch** — Google Stitch's March 2026 relaunch flips the entire canvas from static per-screen previews to a walkable interactive flow behind a single Play button, and can auto-suggest the next logical screen from wherever you just clicked. [Stitch relaunch, Mar 2026](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/) [later]
- **Resize handle as responsive test** — tldraw's Make Real has no separate device-preview mode at all; dragging the live iframe shape's own corner resize handle on canvas is the responsive-breakpoint test. [Make Real: the story so far](https://tldraw.dev/blog/make-real-the-story-so-far) [adopt-v1]

### Zoom-dependent rendering behavior

- **Off-screen shapes vanish, not just fade** — tldraw sets off-screen shapes to `display:none` (viewport culling) backed by an R-tree spatial index, debounces zoom redraws past 500 shapes on a page, and caps 4,000 shapes/page by default. [tldraw performance docs](https://tldraw.dev/sdk-features/performance) [adopt-v1]
- **Two coordinate spaces, one gesture handler** — tldraw content meant to pan-and-zoom with the world lives in the canvas HTML layer, while toolbar/HUD content that should only pan lives in a separate overlay layer. [Things on the canvas](https://tldraw.dev/examples/things-on-the-canvas) [adopt-v1]
- **Ancestor-transform blur is WebKit-only** — any CSS transform (scale or rotate) on an iframe's ancestor renders that iframe's content blurred in WebKit, a bug open since 2014 and confirmed absent in Firefox — a hard argument for Chrome-first shipping if canvas zoom is done via CSS transform. [WebKit Bug 133801](https://bugs.webkit.org/show_bug.cgi?id=133801) [adopt-v1]
- **Resize the box, don't transform the pixels** — the Figma Make / Stitch-style embed precedent resizes a live iframe's own intrinsic box rather than CSS-scaling a rendered frame, sidestepping the WebKit blur bug by construction rather than working around it. [Make Real: the story so far](https://tldraw.dev/blog/make-real-the-story-so-far) [adopt-v1]
- **Mirrored-transform DOM overlay** — the standard recipe behind Excalidraw and Konva for live content on a raster canvas is a real DOM iframe/element layered on top, kept in sync by mirroring the same pan/zoom transform onto the overlay's CSS every frame. [Excalidraw render props](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props) [adopt-v1]

### Empty states and onboarding

- **Canvas as the onboarding narrative** — Paper's own marketing frames the blank canvas itself as "where humans do the part agents are bad at," treating an empty workspace as a deliberate invitation to judgment rather than something to wizard-fill. [A real space to design in the age of agents](https://paper.design/blog/a-real-space-to-design-in-the-age-of-agents) [skip]
- **Every artifact type is a peer on the board** — Google Product Canvas puts personas, sketches, docs, and live running prototypes side by side on one board with no separate "prototype mode" to onboard into. [Google Product Canvas](https://labs.google/code/experiments/product-canvas) [later]
- **Ship a working example, not a tutorial** — tldraw's Make Real onboarding is a fork-and-run starter repo rather than a blank-canvas-plus-docs walkthrough; the "empty state" for a builder is a real project to delete and replace. [make-real-starter](https://github.com/tldraw/make-real-starter) [later]

### Agent-presence and agent-activity indicators

- **Presence scoped to exact nodes, not global** — Paper's live "working indicator" appears only on the specific artboard(s) an agent is editing, cleared by an explicit `finish_working_on_nodes` call rather than a generic "agent busy" banner. [Paper MCP docs](https://paper.design/docs/mcp) [adopt-v1]
- **One presence layer for humans and agents** — Paper's June 2026 build added agents into the same multiplayer cursor/presence layer as human teammates instead of a separate "bot" lane. [Paper build log](https://paper.design/build-log) [adopt-v1]
- **Agent motion as a motion-sensitivity setting** — Paper ships a user-facing "reduce agent animations" toggle alongside the presence feature, treating agent activity motion like any other accessibility/motion preference. [Paper build log](https://paper.design/build-log) [later]
- **Pull selection, push presence** — Paper's selection channel is pull-based (the agent must actively call `get_selection`) while its presence/working-indicator channel is push-based and automatic — the two are deliberately asymmetric. [Paper MCP docs](https://paper.design/docs/mcp) [adopt-v1]
- **A dedicated panel for "which agent is which"** — Google Stitch's Agent Manager tracks several parallel in-flight design-agent runs on one canvas as a list, rather than a single global spinner. [Stitch relaunch, Mar 2026](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/) [adopt-v1]

### Multi-tab project switching

- **Cloud document library as switcher (anti-pattern)** — Paper's `list_files` returns a cloud team's documents most-recent-first with server timestamps; a clean contrast case for what a local-first switcher must not look like. [research/01-paper.md, live Paper MCP observation] [skip]
- **Thumbnail-grid recents (anti-pattern)** — Figma's own multi-file switcher is a "Recent files" thumbnail grid, one shared surface across every document in an account rather than OS-level tabs; general product knowledge, not independently re-verified this session. [skip]
- **Filesystem-native workspace switching** — VS Code/Zed-style multi-root workspace switching keys off a workspace file or recent-folders list of absolute paths, the much closer cousin for a repo-native local tool; general product knowledge, not independently re-verified this session. [adopt-v1]
- **Switch cost is "restore," never "reload"** — the browser-tab/Arc-Spaces model keeps each open project's camera position and selection alive when you switch away and back, so re-opening a project is a state restore, not a fresh load; general product knowledge, not independently re-verified this session. [adopt-v1]

### General / cross-cutting

- **Separate allowlist and render hooks** — Excalidraw gates embeddable iframes through a `validateEmbeddable` allowlist prop kept fully separate from the `renderEmbeddable` rendering prop, so trust-checking and rendering are two independent, swappable hooks. [Excalidraw render props](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props) [adopt-v1]
- **Generated output pre-wired to existing tokens** — Framer's "Workshop" AI component builder outputs a real code component that inherits the project's existing fonts/colors instead of landing unstyled. [Workshop](https://www.framer.com/marketplace/plugins/workshop/) [later]
- **Design-system import keeps generations on-brand** — Magic Patterns can import an existing Figma library/token/code design system so AI-generated screens stay on-brand automatically, alongside a multiplayer canvas with live cursors and shared selection. [Getting started docs](https://www.magicpatterns.com/docs/documentation/projects/getting-started) [later]
- **Pointer-exit has a documented gotcha** — Rive Listeners map raw pointer events (Enter/Exit/Move/Down/Up/Click) straight onto state-machine actions, but Pointer Exit may not fire when the cursor leaves via the container edge rather than the shape itself — worth testing before spool relies on hover/press affordances for frame chrome. [Listeners](https://rive.app/docs/editor/state-machine/listeners) [later]

## Idea candidates

### Agent-native workflow

- **Worktree-per-exploration canvas fork** — a canvas button spawns a new git worktree plus a second canvas window pointed at it, so two divergent agent-driven explorations can be compared live in separate windows instead of one overwriting the other; grounded directly in Liam's own worktree-based agent workflow (this research task itself is running inside one). [later]
- **Cross-agent soft-lock indicator** — when multiple agent sessions run in parallel worktrees against the same repo, canvas shows a lightweight badge on any frame another live session is currently touching, via a heartbeat file rather than a hard lock; extends Paper's human-presence pattern to agent-vs-agent collision instead of agent-vs-human. [later]
- **Canvas command-bar to the agent** — a Cmd+K-style bar over a selected frame sends a short instruction straight to the bound coding agent (writes a request file or shells the CLI) without switching to the terminal; grounded in Linear-style command palettes layered over spool's already-planned CLI, and doesn't touch frame source directly. [later]
- **Per-frame token/cost HUD** — a small badge on each frame tile shows the running token/dollar spend of the agent sessions that authored it, parsed from session logs already produced; grounded directly in Liam's own standing rule that cheap workers implement and he polices token spend. [adopt-v1]
- **Record-once, replay-by-agent scenarios** — Liam manually walks a flow once in Play mode; spool records the `ui.go`/`ui.state` sequence as a reusable script an agent can replay for regression checks after future edits, cousin of Playwright's own codegen recorder applied to spool's already-decided runtime primitives. [later]
- **Agent handoff notes pinned to frames** — when an agent finishes working a frame, it leaves a small structured note (what it did / what's uncertain / what to check) pinned to that frame, distinct from Paper's human-to-human comment threads because it's machine-authored and PR-description-shaped rather than a discussion thread. [adopt-v1]
- **Directory-triggered skill auto-load** — a Claude Code/Codex hook fires whenever the working directory contains `design/canvas.json` and auto-attaches the spool skill/context without Liam invoking it by name, reusing the same marker already decided for project-identity detection for a second purpose; mirrors the trigger-based skill-loading pattern already active in Liam's own environment. [adopt-v1]

### Spatial and canvas-native

- **Topology view toggle** — an alternate force-directed/graph-layout projection of `canvas.json`'s flow edges, decoupled from the spatial arrangement, for spotting orphaned frames or dead ends at a glance; cousin of Obsidian's graph view, a tool Liam already uses for note-linking. [Obsidian graph view](https://obsidian.md/) [later]
- **Synced side-by-side variant compare** — two sibling variant frames (already a first-class concept) play simultaneously with mirrored `ui.state`, so interacting with one drives the same interaction in the other for spot-the-difference review; grounded in Liam's own stated variations-then-choose design process and in visual-regression tools like Chromatic as the QA cousin. [Chromatic](https://www.chromatic.com/) [adopt-v1]
- **Spatial adjacency as agent-readable context** — expose "what's near this frame" from `canvas.json` to the agent itself, so it can place a new empty-state variant next to its parent frame instead of always appending off to one side; pushes Miro/FigJam-style spatial clustering from a human affordance into machine-readable context. [later]
- **Named camera bookmarks** — save named pan/zoom viewport presets ("onboarding overview," "checkout detail") for instant recall on a board with dozens of frames, distinct from Figma's flow-specific starting points because it's an Arrange-mode navigation aid, not a Play-mode entry point. [adopt-v1]
- **Auto-follow camera during background runs** — canvas optionally pans/zooms to whichever frame a background agent is actively editing, a toggleable "ride shotgun" mode; cousin of Figma's follow-a-teammate's-cursor/Spotlight presenting, aimed at an agent instead of a human. [later]
- **Shared frame partials with drift badges** — an optional, lightweight include mechanism purely within `design/` (e.g. a shared header used by six sibling frames) with a canvas badge when an instance has drifted from its source; explicitly scoped to reuse *within* spool's own authored frames, not the separate, already-open exploration of editable product components on canvas (issue #11). [later]

### Data, testing, and quality

- **Fixture-state matrix grid** — render one frame across all of its `system/fixtures/*.json` states (empty/loading/error/populated) simultaneously as a small grid of live mini-iframes instead of switching between named presets one at a time; cousin of Storybook's per-component story variants viewed as a set, verified via Chromatic's own "scan all possible UI states" framing. [Chromatic](https://www.chromatic.com/) [later]
- **Structural frame-lint pass** — a CLI-runnable static check across all frames for orphaned frames (no incoming `data-go`), dead `data-go` targets, and basic accessibility violations, surfaced as a badge on canvas tiles; distinct from the already-decided interactive click-through validation loop because it's structural, not behavioral, and can reuse an off-the-shelf rules engine. [axe-core](https://github.com/dequelabs/axe-core) [adopt-v1]
- **Visual production-drift diff** — once two-way sync exists, screenshot-diff a canvas frame's render against a live Playwright capture of the actual shipped route at the same breakpoint and flag drift automatically; a concrete verification mechanism for the sync exploration that isn't specified yet, cousin of Percy/Chromatic-style visual regression. [Chromatic](https://www.chromatic.com/) [later]
- **CDP sensor/geo emulation for frames** — since spool is Chrome-first and already leans on a headless driver for validation, expose geolocation and device-orientation overrides via the Chrome DevTools Protocol Emulation domain so location- or motion-aware frames can be exercised without real hardware. [CDP Emulation domain](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/) [later]
- **Local LAN device mirror** — spool's local server binds a LAN address and renders a QR code so a live frame can be opened on a real phone/tablet on the same network for genuine touch-target testing, with no cloud relay; cousin of ProtoPie Connect and Figma's phone-mirror feature, reimplemented local-first to match spool's no-cloud stance. [adopt-v1]

### History and search

- **Git-native per-frame history** — hovering a frame tile synthesizes a one-line summary from its last commit message so Liam can scan dozens of tiles for "what changed and why," and selecting a frame exposes a scrubber over its actual commit history rendering the historical `srcdoc` at each point, not just the current file on disk; git is already the decided versioning layer, this just projects it onto the canvas UI. [adopt-v1]
- **Semantic frame search** — a Cmd+K-style search across all frame files and fixture states using the agent's own file-reading and reasoning ability ("take me to the checkout error state") rather than filename/text match alone, useful once a board holds dozens of frames; cousin of Spotlight/Linear-style fuzzy search, pushed further by an agent that can actually read the files behind each result. [later]

---

## Fable ideation pass (main session, 2026-07-20)

Added candidates — same rules, tags are suggestions only:

- **Frame lifecycle front-matter** — each frame declares `status: exploring | chosen | promoted` plus a one-line intent in a small front-matter block; canvas badges it, the CLI lists it, and "chosen" becomes the machine-readable form of taste-is-locked-execute-literally. [adopt-v1]
- **Handoff command** — `spool handoff <frame|flow>` packages the chosen frames, fixtures, flow edges, and a short generated spec into a build-ready ticket body; the concrete v1 form of the two-way promise before component sync exists. [adopt-v1]
- **State timeline** — the runtime owns `ui.state`, so log every mutation per play session and let any moment be exported as a named scenario preset; the log is nearly free, record/replay rides on it, scrubber UI can come later. [adopt-v1]
- **Flow coverage dimming** — play sessions record which links and states were actually walked; arrange mode dims never-visited paths. The dynamic complement to the structural lint pass. [later]
- **Render matrices beyond fixtures** — generalize the fixture-grid axes: one frame source rendered across viewports and light/dark simultaneously as a locked grid; iframes are real viewports, so this is arrangement work, not runtime work. [later]
- **URL-to-frame import** — paste any URL and snapshot its DOM/CSS into a frame source to riff on; matches an existing habit of redesigning ugly incumbents, and doubles as a crude own-product importer before component sync exists. [later]
- **Golden states as taste locks** — pin a screenshot of the agreed state beside a frame as the reference artifact; implementing agents pixel-check against it. The pre-ship sibling of the visual production-drift diff. [later]

Judgment on the sweep — what I'd graduate onto the map now:

- **Patterns, folded into existing tickets rather than new ones**: nothing-selected pan, modifier zoom, Shift+Space preview, the P link mode with the four-step linking gesture, blue-flag starting points, one-name-three-surfaces, flows inferred/overlapping/never pre-declared, bound auto-updating arrows, thumbnail-then-hydrate, resize-handle-as-responsive-test, the culling and two-coordinate-layer rendering patterns, presence-scoped-to-nodes with pull-selection/push-presence, workspace-file switching with restore-not-reload, and the allowlist/render hook split. These become checklist input for "v1 canvas scope" (#7), "Flow layer semantics" (#5), and the two tests (#8, #9).
- **Ideas I'd take for v1**: directory-triggered skill auto-load; agent handoff notes; synced side-by-side variant compare; named camera bookmarks; structural frame lint; LAN device mirror; git-native hover history (scrubber later); per-frame cost HUD with one nuance — attributing spend to a frame needs the handoff-notes convention first, so it lands right after that exists.
- **Two corrections of emphasis**: "resize the box, don't transform the pixels" applies to *frame resize*, not to canvas zoom — world zoom still needs a CSS transform, which is fine Chrome-first and is exactly what the live-frames test measures. And the [later] on Stitch's auto-suggest-next-screen is right for taste reasons, not technical ones: generative scope creep is the thing spool's Liam-picks model exists to avoid.
