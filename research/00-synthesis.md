# spool: exploration synthesis

Session synthesis, 2026-07-20 (Claude Fable exploration session + Liam's refinements). The four extraction reports in this folder (01-04) are the evidence base; this file is the argument. The bank page (`~/bank/personal/wiki/projects/spool.md`) carries the running decision list; where they disagree, the bank page wins.

## The product in one line

An infinite canvas where every frame is a real sandboxed web surface (HTML/CSS/JS), authored primarily by agents, arranged and inspected by Liam, with a flow layer linking frames into walkable app simulations, and a promotion path between canvas frames and product code.

## Novelty verdict

Nothing ships the full combination: agent-first authoring + live frames + Figma-feel canvas + flow links + local/repo-native + two-way with product code. Closest neighbors and what each lacks (details + citations in 03):

| Product | Has | Lacks |
|---|---|---|
| Magic Patterns | live React frames, canvas, connection arrows + play mode | agent-first authoring (own chat primary, MCP a bridge); cloud SaaS |
| Google Stitch (Mar 2026 relaunch) | infinite canvas, design agent, click-play prototyping, MCP | your agent, your disk, repo two-way; Labs product |
| Pencil.dev | .pen files in your repo, Claude Code MCP, tight handoff | flow layer; early access |
| Reframe (OSS) | iframes on canvas, MCP for any agent | flows; tiny/unproven |
| Onlook | your actual app live, source mapping (data-oid) | multi-frame prototyping space (one live view) |
| Paper | real HTML/CSS medium, deep MCP (33 tools) | any behavior at all: no JS in the model, inline styles only, roadmap has zero prototyping |
| Figma | canvas feel, flows-as-noodles | live substrate; Make is quarantined from the canvas by design |

Figma's prototyping ceiling (02) is the strongest argument for the substrate: 12 triggers, 8 action variants, scalar variables, no loops/arrays/live data, no real text input (staff-confirmed), no scroll logic. Smart Animate = layer-name matching over 5 properties. All of these cost ~nothing in real DOM.

## The core inversion

Paper: the canvas node tree is truth, HTML is a lossy input codec (JS stripped, classes dropped). spool: **the document is source code on disk; the canvas is a projection.** Frames are folders with an entry file; `canvas.json` holds arrangement, annotations, and flow arrows only. Agents author by editing files (their best surface, unmetered); git is versioning; no cloud, no auth, no DB in v1.

## Architecture stances (as of charter)

1. **Doc model**: `design/` inside the product repo. `canvas.json` (layout/links), `frames/<name>/index.html`, `system/tokens.css`, `system/fixtures/*.json`, `importmap.json`. Project identity = repo name; `design/canvas.json` is the detection marker. Variants are sibling frames.
2. **Frame substrate**: sandboxed srcdoc iframes, `allow-scripts` without `allow-same-origin` (null origin; postMessage is the only bridge). Same-origin frames share a renderer process (04), so dozens live is fine; scale comes from the lifecycle: **snapshot → warm (mounted, inert) → live (interactive)**, driven by viewport and zoom. Figma Make embeds validated thumbnail-then-hydrate as UX. Snapshots: iframes are black boxes to in-page capture (04), so either cooperative self-capture (injected runtime rasterizes its own DOM, messages the image out) or local Playwright/CDP capture. Spike decides.
3. **Two modes**: Arrange (Figma-feel; drag/snap/organize frames; clicks select. Frame-level manipulation ONLY: canvas never writes frame source. Element click = read-only selection context for the agent) and Play (pointer passes through; everything works because it is real DOM).
4. **Flow layer**: injected runtime in every frame: `ui.go(frame)`, `ui.back()`, `ui.state` (shared reactive store across a play session), `ui.mock` (fetch interceptor + fixtures + latency knobs), plus declarative `data-go="frame"`. Arrows = static parse of `data-go` + runtime-discovered edges when `ui.go()` fires. Scenario presets (loading/empty/error) via `ui.state`, one frame instead of N duplicates.
5. **Player**: View Transitions cannot cross iframe boundaries in either direction (04), so screen-to-screen morphs happen in a player that composes frame sources into ONE document and swaps screens on `ui.go()`. Same-document `startViewTransition` + `view-transition-name` matching = native Smart Animate (Chrome/Safari/Firefox 144+), WAAPI-drivable for spring feel. Canvas = iframes for isolation; player = one document for cinema. Same frame files feed both.
6. **Agent surface**: files first, no MCP in v1. Thin CLI over the runtime's localhost HTTP API: `spool selection`, `spool shot <frame> -o out.png`, `spool flows`; a skill teaches it; identical in Claude Code and Codex. Screenshots land as files the agent Reads. MCP later only as a wrapper over the same API. Selection maps to source via injected location attributes (Onlook's data-oid pattern).
7. **Libraries**: buildless ESM URL imports pinned in `importmap.json` (three.js, motion, d3, shaders; zero build step; runtime may cache/vendor). `design/` stays dependency-free; the npm-installed thing is the spool runtime itself (`bunx`-able). TSX frames importing product modules = fog.
8. **Sync, two risk classes**: tokens one-way (product CSS → `design/tokens.css`) is v1-safe. Product components living editable on the canvas (edit the canvas button, product changes) is a headline exploration: needs host build to render, makes the canvas an editor of production code; Rive's typed view-model contract (02) is the reference pattern for truth direction.
9. **Validation loops**: same local server + headless driver → agents click through their own flows, screenshot states, iterate until it matches intent; Liam reviews the visual only (AFK/HITL split).
10. **Canvas engine: undecided.** tldraw-first lean (snapping/arrows/frames/minimap/replaceable chrome out of the box; Make Real proves iframe hosting; 4k shapes cap fine) vs custom DOM canvas (owned, no license). tldraw relicensed 2025: commercial "value-based pricing", hobby watermark; $6k/yr startup figure is secondhand. Bake-off spike settles it against a Figma-feel checklist.

## Steal list

- Figma: arrange-mode feel wholesale (keybinds, snapping, flows panel, named starting points); spatial camera-pan navigation when following a flow link.
- Magic Patterns: the linking gesture (P, click element, click destination; arrow appears) as sugar that writes `data-go` into source.
- Figma Make embeds: thumbnail-then-hydrate lifecycle.
- ProtoPie: scenario presets; per-scene vs global state scoping. (Their trigger/response machinery: skip, code subsumes it.)
- Rive: typed data-binding contract as the eventual promotion mechanism.
- Onlook: source-location attributes for selection-to-code mapping.
- Stitch: agent-facing DESIGN.md sitting next to tokens.
- Origami: nothing; dataflow patch graphs are what you build when you cannot have code.

## Known risks

- WebKit renders transformed-iframe content blurry (bug open since 2014): Chrome-first tool.
- Snapshot pipeline needs a spike (cooperative self-capture vs local Playwright).
- Dynamic `ui.go()` targets cannot be statically arrowed; runtime discovery only.
- Inline conveniences (text tweak, delete element) would be source writebacks; whether they exist at all is a charter question.
- tldraw license economics if it wins the bake-off.

## Paper migration path

Paper's MCP exports JSX and computed styles (`get_jsx`, `get_computed_styles`), so existing Paper files can be pulled across by an agent. Paper remains in use until spool reaches parity.
