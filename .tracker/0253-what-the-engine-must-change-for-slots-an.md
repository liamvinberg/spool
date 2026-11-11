# #253 · What the engine must change for slots and the deck

- State: closed
- Labels: wayfinder:research
- Parent: #251
- Tasks: task 557 (Spool presentations and extension core)
- Created: 2026-11-10T08:20:58.139Z
- Updated: 2026-11-10T08:27:04.200Z
- Closed: 2026-11-10T08:27:04.200Z

## Question

What must change in spool's engine (everything under the window: daemon, player, frame runtime, readers of `design/`) so that features can plug into slots and a deck page can exist?

Facts with file and line, then a list of what must change, largest first:

1. **Player.** The local player composes every frame into one document; the cloud viewer's player swaps iframe documents; the Mac app has a play window. What would one player with modes take (flow as today, deck stepping through a page's order and through steps inside a slide), on all three hosts? Where would a mode plug in, who owns keys, and how would a second window (presenter view) stay in step with the audience window?
2. **A page kind.** Where a per-page record (kind, ordered layout, play mode) would live, how team sync and older spool versions and spool-cloud's reader treat keys they don't know.
3. **Notes per slide.** The candidate homes (a `notes.md` beside `frame.tsx`, the sidecar, the TSX itself) and what each means for sync, history, compile and agents.
4. **Ordered layout.** What deriving a frame's place from the page's order touches.
5. **Daemon.** What a route registrar would need in place of the hand-mounted factories in `src/daemon/app.ts`; the same for CLI verbs; settings and experiments as models.
6. **Frame calls.** The steps to add a call to the `spool` import today (as `ui.knobs` was), and what a general slot for frame calls would need.
7. **The two readers of `design/`** (`projection.ts`, `design-projection.ts`): can they become one?
8. **Many live slides.** What exists for frames off screen (stills, freeze, the warm pool) and whether a deck of live WebGL slides fits.

## Comments

### agent, 2026-11-10T08:27:04.200Z

## Resolution (research, task 557 scout, 2026-11-10)

# Engine slots and decks

Read-only scout. `cloud/` = `/home/liam/dev/projects/spool-cloud/`; other paths = Spool. Recommendations are proposed, not existing APIs.

## Facts

### 1. Player

- Local Play compiles all project frames into one split bundle with shared chunks/per-frame styles; config has scenario/start/sizes but no page/mode/order/step (`src/daemon/player-compile.ts:25–62,160–175`; `src/runtime/frame-runtime.ts:59–81`). It switches one mounted React component, keyed by arrival (state resets), activating styles and View Transitions. Other slides are modules, not mounted documents; warmScreens imports/evaluates three per idle slot, so module-level side effects still run (`src/runtime/frame-runtime.ts:1089–1119,1679–1729,1797–1800`).
- Local trusted shell owns navigation snapshots, a runtime MessagePort and generation/request/geometry handshakes; iframe is sandboxed without same-origin (`src/runtime/player-shell-runtime.tsx:101–157,169–203,1153`).
- Cloud reuses Player chrome/controller but implements navigation by replacing iframe documents, transferring scenario/session and keeping outgoing document until arrival draws; messages check active window/frame (`src/ui/viewer/viewer-player.tsx:95–177,232–251,265–293,365–407`). Local transitions/shared-module semantics therefore differ.
- Controller has frame/arrival/external URL, geometry, frame list, walk/fit/close, not mode/advance/step; frames follow projection's name sort, not rail order (`src/runtime/player-chrome.tsx:39–60`; `src/daemon/projection.ts:522`).
- Mac intercepts local /play URLs and loads them in a BrowserWindow; it adds geometry/restoration/preload, not a third renderer (`desktop/src/main.ts:836–977,1008–1017`).
- Ordinary keys/Escape belong to prototypes; local forwards only leave accelerator from focused iframe. Viewer parent separately takes Escape. No deck policy (`src/runtime/player-chrome.tsx:126–140`; `src/runtime/frame-runtime.ts:1554–1561`; `src/ui/viewer/viewer-player.tsx:245–251`).

### 2. Page kind

- Pages are inferred folders above frame.tsx leaves, not records. Leaf frame.json without entry means placeholder: don't use it for page metadata (`src/daemon/projection.ts:29–49,143–179`; `src/daemon/design-projection.ts:38–59`).
- canvas.json is a durable extensible envelope: readers ignore unknown keys; atomic single-key writers preserve others and refuse corrupt JSON (`src/daemon/canvas-file.ts:8–19,59–76`). Order already stores parent→page names and page→frame names, root key "" (`src/daemon/canvas-fields.ts:8–36`). Effective order removes stale/duplicate names, inserts arrivals alphabetically or by variant base, not append—decide whether decks want that (`src/ui/canvas/order.ts:34–78`).
- Sync carries canvas.json and all non-dot files under frames/shared, regardless of suffix. Canvas merge preserves unknown top-level keys, but only places merges per entry: a new pages map otherwise conflicts as one last-writer-wins value (`src/team-sync-protocol.ts:469–480,570–615`; `cloud/src/worker/sync/object.ts:1074–1084`). Current top-level writers tolerate additive metadata; unknown nested order keys are reconstructed away on write. Older historical releases weren't individually audited (`src/daemon/canvas-fields.ts:20–36`; `src/daemon/canvas-order.ts:40–56`).
- Raising canvas format disconnects older team daemons; decide whether old clients may see a deck as a plain canvas (`cloud/src/worker/sync/object.ts:327,1010`; `cloud/src/worker/sync/sync.worker.test.ts:508–541`). Cloud calls Spool's exported projectDesign over memory, currently exposing only pages/frames/order, but pins spool.page 0.48.0: publishing core is not deploying cloud support (`cloud/src/worker/frames/object.ts:2–13,264–267`; `cloud/package.json:49`; `src/daemon/design-projection.ts:17–22,65–84`).

### 3. Notes: candidate homes and consequences

- **Sibling notes.md** syncs and history attributes it to its frame; discovery is unaffected. Agents can read/write plain Markdown. Unimported notes stay outside executable bundles; .md has no default loader, though text import attributes work. Add independent notes reads/events/API (`src/team-sync-protocol.ts:469–480`; `src/daemon/history.ts:182–193`; `src/daemon/projection.ts:41–49`; `src/daemon/design-compile.ts:78–91,134–147`).
- **frame.json** ignores unknown keys on read but geometry/placement writes serialize only x/y/w/h, deleting notes. Sidecar-only history means “moved”, and team frame-source classification excludes frame.json. This home requires preserving writes and changing history/source semantics; notes compete with geometry saves (`src/daemon/sidecar.ts:31–55`; `src/daemon/geometry.ts:36–66`; `src/daemon/history.ts:112–149`; `src/team-sync-protocol.ts:1780–1783`).
- **TSX** shares executable source sync/history/conflicts. Runtime-exported notes enter compilation and can be unavailable when a slide breaks; comments instead need static extraction. Don't execute frame code in the trusted daemon to discover metadata (`src/daemon/design-compile.ts:239–247`; `src/daemon/player-compile.ts:188–205`).
- None is a secrecy boundary: all sync to teammates. Presenter-only display requires excluding notes from audience payloads; private notes additionally need cloud serving authorization, not just a hidden panel (`src/team-sync-protocol.ts:469–480`; `cloud/src/worker/frames/object.ts:264–274`).

### 4. Ordered layout is not rail sorting

- Order never changes positions. Local projection auto-writes missing placement beside the page's field/placeholders; cloud derives the same without writing. Geometry endpoint directly writes sidecars/emits events. Ordered page layout must bypass auto-placement and reject/translate direct moves; all consumers need the same effective boxes. Sizes can remain sidecar-authored (`src/ui/canvas/order.ts:16–18`; `src/daemon/projection.ts:482–522`; `src/daemon/design-projection.ts:24–31,69–84`; `src/daemon/canvas-routes.ts:271–308`).
- Effective geometry also determines top-left cover choice; both readers implement it. Page metadata must follow subtree move/delete just as order keys already do; frame rename order preservation also exists client-side (`src/daemon/design-projection.ts:106–123`; `src/daemon/projection.ts:793–813`; `src/daemon/canvas-order.ts:59–112`; `src/daemon/explorer.ts:94–95,388–389`; `src/ui/canvas/order.ts:103–112`).

### 5. Daemon routes, CLI and declarations

- app.ts hand-mounts factories with explicit dependencies and hand-closes resources; typed Hono chain already became too deep (`src/daemon/app.ts:1584–1597,2139,2711–2735`). Registrar needs lifecycle/service context, not merely array iteration.
- Core middleware owns host validation, render path allowlist/CSP, control token/exact Origin and scoped capture/hook exceptions. Registrations must declare authority; no extension can simply mount a render route or expose control token (`src/daemon/app.ts:1350–1427`).
- CLI is one Commander program with module-global context and preAction hook, then imperative commands. Register contributions on it with shared/injected execution context (`src/cli.ts:84–123,126–170`).
- Settings already declare scope/shape/default/text, but registry/types are closed and unknown writes rejected. Machine writes preserve keys; invalid values default. Dotted project reads traverse nested keys, while writes currently use literal top-level key: fix before extension settings (`src/settings/registry.ts:18–49,146–160,239–257`; `src/daemon/settings.ts:60–102,114–144`).
- Experiments already model stage/default, setting rows, CLI and boot; retired unknown names persist without effect. Useful declaration semantics, not a dynamic loader (`src/settings/experiments.ts:1–35`; `src/daemon/app.ts:2478`).

### 6. Adding a frame call today (knobs as precedent)

- Add declaration to `SpoolUi` and implementation to frozen `ui`; package build copies that declaration as the public types (`src/runtime/spool-public.ts:3–15,115`; `src/runtime/frame-runtime.ts:2040`; `package.json:40–41`). Runtime vendor serves that implementation (`src/daemon/vendor.ts:110–126`).
- Host calls add validated wire messages, runtime dispatch and host routing. Knobs has declaration/value/action stores and is silent during play; canvas maintains live overrides and source-write/undo, with durable writes through the guarded daemon lane (`src/runtime/frame-runtime.ts:356–363,1821–1861,1981–2007`; `src/runtime/knob-protocol.ts:1`; `src/ui/canvas/use-knobs.ts:23–57`; `src/daemon/hand-routes.ts:200–214,293–300`).
- Source-aware calls additionally need AST recognition/site stamps/literal write-back. Knobs stamping is hardwired into common compile; pure calls don't need it. shared/ui's no-spool-import boundary must remain (`src/daemon/knob-literals.ts:13–40,192–207`; `src/daemon/design-compile.ts:700–727`).

### 7. Can the two design readers become one?

Yes: one pure semantic projection with local adapters, not one universal side-effectful function. DesignFiles already abstracts disk/memory. projectDesign duplicates discovery/placement; daemon adds covers/broken/birth/seen and persists placement. Parity is tested (`src/daemon/design-files.ts:12–29`; `src/daemon/design-projection.ts:33–84`; `src/daemon/projection.ts:424–440,482–522`; `src/daemon/design-projection.test.ts:28–65`). Share parsing/discovery semantics, metadata/order/layout/cover selection; return placement intents. Keep secure disk discovery, async I/O and local empty directories distinct from memory's inferred folders (`src/daemon/projection.ts:114–139,444–449`; `src/daemon/design-files.ts:31–55`).

### 8. Many live WebGL slides

- Canvas is already bounded by readable area, not project frame count: documents exist for entered/readable/selected/exported frames; pictures alone never cause mounts. Readable is 400 CSS px, viewport ring adds 25%; idle freeze is one minute, with camera/Edit/rest-strain causes (`src/ui/canvas/lifecycle.ts:11–38,87–106,150–176`; `src/cover.ts:7–8`). “Warm pool” is not a current canvas lifecycle state: states are picture/held/live (:41).
- Stills come from a separate three-tab daemon booth; browser lingers 30 seconds, not one tab per slide (`src/daemon/booth.ts:25–27,50–73`). Freeze gates rAF and CSS/Web Animations while retaining the iframe and its GPU resources; it does not fake `performance.now()` or stop arbitrary timers/workers (`src/runtime/frame-shim/freeze.ts:28–59,69–92,129–141`). It therefore helps conventional rAF WebGL loops but is not a GPU-memory budget or universal simulation pause.
- A deck fits with current slide/bounded neighbors and still previews. Local mounts one component; cloud briefly keeps two (`src/runtime/frame-runtime.ts:1797–1800`; `src/ui/viewer/viewer-player.tsx:291–293`). Remount loses simulation state; live presenter copies double GPU work without synchronizing arbitrary React/WebGL state. SessionRecord holds only scenario/state/stack (`src/runtime/frame-runtime.ts:59–63`).

## Required changes, largest first (proposed)

1. **One play engine, mode contributions, host adapters.** Extract session/navigation from runtime/shell/viewer. Mode owns advance/reverse/jump; host owns windows/history/loading/sizing. Flow keeps walks; deck consumes page order and tracks absolute `(slide, step)`. A step frame call reports bounds and applies step state. Specify reverse/reset and interactive-slide key policy; forward sandbox key intents into one policy. Preserve generation/readiness/source checks. One behavior engine can support both execution adapters, but transition differences must be intentional (§1).
2. **Presenter session authority.** One owner accepts intents and publishes revisioned absolute snapshots (session, page/mode, slide, step), replayable on reconnect. Both windows subscribe; neither independently advances. Trusted same-origin window transport locally, Electron window/IPC adapter on Mac; server relay only for remote control. No control credentials in render code. Default previews to stills: a second live rendering doubles work and slide/step does not synchronize arbitrary animation (§1, §8).
3. **Page model and shared projection/layout slot.** Dedicated canvas key keyed by page path/root, or page files never called frame.json; namespaced kind/layout/play declarations. Reuse frame order, don't duplicate it; decide missing-slide insertion. One pure semantic projection returns effective boxes and placement intents, with local I/O/enrichment outside. Change geometry mutations, rename/move/delete, events and cover selection. Preserve unknown fields; unknown kind needs safe fallback (§2, §4, §7).
4. **Extension composition root.** Registries need namespaced IDs, duplicate rejection, deterministic ordering, activation/disposal and narrow injected services. Routes declare authority and stay behind core middleware; CLI registers on existing Commander with shared context. Contribute settings/experiments as schemas, preserving unknown values and fixing nested project persistence. Installing trusted daemon code is not equivalent to authoring sandboxed TSX (§5).
5. **Frame-call contract.** Separate render-safe implementation from trusted handlers; declare types, validated wire messages, lifecycle, optional source stamping/edit hooks, unsupported-host behavior and protocol version. No arbitrary privileged dispatch. Migrate knobs as proof; steps need not inherit knobs' literal write-back complexity (§6).
6. **Content and rollout.** Prefer notes.md, read without compiling a slide; authorize presenter access and exclude notes from audience payloads. Add per-page merge semantics on both sync sides if using a canvas map. Bump format only if deliberately blocking older clients. Publish core exports and update Cloud's pin/serving. Extend projection parity, player runtime/parity, sync merge and geometry/history tests, plus one two-window wiring flow (§2–§8; src/daemon/player-parity-browser.test.ts:1; src/runtime/player-runtime.test.ts:1).
