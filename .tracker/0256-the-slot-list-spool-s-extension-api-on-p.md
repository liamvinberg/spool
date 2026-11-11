# #256 · The slot list: spool's extension API on paper

- State: closed
- Labels: wayfinder:grilling
- Parent: #251
- Blocked by: #252, #253
- Tasks: task 557 (Spool presentations and extension core)
- Created: 2026-11-10T08:20:58.350Z
- Updated: 2026-11-10T18:18:23.816Z
- Closed: 2026-11-10T08:52:53.348Z

## Question

What exactly is spool's extension API: which slots exist, what is each one given, and what does an extension look like in code?

This is the API on paper, before any of it is built. Settle:

- The list of slots (the map's Notes name the candidates) and what each receives: which state it can read (selection, camera, page, frames), what it can write, and through what.
- The shape of an extension in code: one definition, what it registers, how its window half and its frame half are told apart.
- How frames declare and the window draws, generalised from knobs.
- What stays private to the core, and the rule that keeps spool's own extensions off anything private.
- The words: extension, slot and the rest go in `GLOSSARY.md`.

Check the list against real features by walking three through it on paper: knobs (a properties section, a frame call, a daemon route), record (the player, a CLI verb, a menu item) and the deck. Inputs: the research on how others shape their APIs, the engine research, and whatever the deck's look has shown it needs.

## Comments

### agent, 2026-11-10T08:52:53.326Z

## Resolution (task 557, 2026-11-10): the extension API on paper

Agreed with Liam: the slot list as a start, guide and check included; extensions draw with spool's primitives and design system, free drawing only in a pane's body, a layer and a frame decoration; the new thing is called an **extension** and the Chrome one becomes the **browser extension**. His condition: the slots must enable anything our own features need, so the list was checked by walking every surface spool has today through it (the next comment holds that coverage check). The first list of 14 slots missed things; this is the list after the check. It is unproven until the spike and the first moved features.

### An extension

One folder, read without running any of its code, with up to four **parts**, one per place code runs:

```
extensions/deck/
  extension.ts   id, name, SDK range, parts, the data it owns
  window.tsx     runs in spool's window (trusted)
  frame.ts       runs on the render origin with the frames
  daemon.ts      runs in the daemon (Node)
  cloud.ts       runs on spool.page; official extensions only for now
```

```ts
export default defineExtension({
  id: "spool.deck",                 // spool.* is official
  name: "Deck",
  api: "^1",
  parts: { window: () => import("./window"), frame: () => import("./frame"), daemon: () => import("./daemon") },
  data: [
    { kind: "frame-file", name: "notes.md", merge: "text" },
    { kind: "canvas-key", key: "deck", merge: "per-entry", version: 1 },
  ],
});
```

Each part exports a function that is handed that side's API and registers into slots, pi-style. Every registration is tied to the extension's life: switching it off removes all of it. Parts load lazily, when first needed.

### Slots

Window part:

- **pane** `{ id, title, icon, mark?, render({ width, visible, focus }) }`. A panel in the rails. `mark` carries working, waiting and unread, as `PaneDef` does today.
- **section** `{ id, title, when(held), render({ held }) }`. In Properties, for what is held: a frame, an element, several, a page.
- **tool** `{ id, title, icon, cursor, pointer: { down, move, up, cancel } }`. A pointer mode, not a button: while chosen it owns the pointer on the canvas, gets canvas and frame coordinates and hit tests, may hold frames frozen, and hands back to Select. Core decides who owns the pointer.
- **layer** `{ id, space: "canvas" | "window", order: "under" | "over", render() }`. Canvas space moves with the camera (flow arrows, pins); window space sits on the screen (faces, the path, palettes, a status mark). Takes no pointer outside the regions it declares.
- **frame decoration** `{ id, place: "label" | "edge" | "over", when(frame), render({ frame, geometry, state }) }`. Marks on or around one frame (unseen, agents at work, a walk chip).
- **command** `{ id, title, icon?, when?(target), run(target), key?, places?, children? }`. One named action, placed on a key, a context menu (frame, canvas, page), the toolbar, the find palette, the player's toolbar, the export menu. `target` is a snapshot of what it was invoked on. `children` makes a submenu. An export format is a command placed in the export menu.
- **setting** as today's settings registry entry, plus **settings section** `{ id, title, render }` for setup UI that is not one value.
- **onboarding step** `{ id, after?, done(), render }`.
- **ingress** `{ id, on: "paste" | "drop" | "link" | "external", match(payload), take(payload, target) }`. Things arriving from outside, tried in order; a handler takes it or passes. `external` (the browser extension posting a reference) is a declared capability and still goes through core's origin checks.
- **page kind** `{ id, name, layout: "free" | "ordered" | fn, frameSize?, play, template? }`. A page kind names its play mode; that is the one precedence between the two.
- **play mode** `{ id, keys, advance, back, reset, chrome, windows? }`. What keys and "next" mean during play, over a session of page, frame and step. One window is the authority and publishes numbered snapshots; other windows (a presenter view) follow.

Frame part: a module loaded into the frame runtime. It **adds calls to the `spool` import** (`ui.steps(n)`, `ui.knobs(schema)`), may keep state of its own in the runtime, and gets a typed channel to its own window part and to the play mode. Messages are checked against the declared schema, the sender's ownership of its frame, and a size limit. It never holds a daemon capability. Frames declare, the window draws.

Daemon part:

- **route** under `/x/<id>/`, always behind core's origin and capability checks.
- **verb**, a CLI command.
- **lifecycle**: on start, on project open, on stop; **job** (a bounded queue with cancel); **watch**.
- **agent guide** (text added to what the agent is told), **agent check** (rules for `spool check`), **agent context** (what a selection adds when it is sent to the agent), **agent tool** (something the agent can call).

Cloud part: comments, presence, shares, team history and the viewer have code on spool.page, so they cannot be daemon-only extensions. How a cloud part is expressed is its own ticket on the map. Until then they reach the cloud through core services.

### Services (what a part is handed)

- **Stores**, read: frames, pages and the current page, selected frames, picked elements, the entered frame, the tool, the camera. **Actions**: select, go to a page, move the camera, enter a frame.
- **Structure**, in one transaction with an undo receipt: create, copy, move, rename, trash, restore, reorder frames and pages. Raw file writes cannot keep the canvas's invariants, so this is core.
- **Write lane**: ops on TSX literals and sidecars, with undo.
- **Frames at run time**: message a frame's part, measure (site boxes, the element tree), capture and freeze leases.
- **Projection**: show another projection of the project read-only in place of the live one (history showing an old version).
- **Files and storage**: the extension's own declared data in `design/`, per-project and per-machine storage, with versions and migrations.
- **Events**, observe only: compiled, document ready, saved, renamed, deleted, team save, collision, agent turn, tool and result, selection and page changes.
- **Sync transport** (an ephemeral channel as presence uses), **stills**, **clipboard**, **settings**, **notify** (keyed notices with actions and progress), **agent** (threads, hand it a selection, permissions).

### Rules

1. An extension imports only `spool/sdk`, official ones too, held by lint. A feature that cannot move is a missing slot or service: it is added for everyone, never bypassed. VS Code's Git extension leaning on private APIs is the failure to avoid.
2. Slots are added, not reshaped. The API is promised stable only once every official feature lives on it; after that, additive within a major.
3. Extensions observe; they do not veto. Pointer ownership, key precedence, read-only projections and destructive operations are arbitrated by core.
4. Nothing is lost without the code. Switched off or missing, an extension's data stays on disk and readable: a deck page shows as a plain page, `notes.md` stays.
5. UI is built from the primitives the SDK exports (`src/ui/primitives`, about 100 components in 11 families) and the theme roles. Free drawing only in a pane body, a layer and a frame decoration. `src/design-lint.ts` checks colours and timings today, not that primitives are used, so that rule is new.
6. React, not a UI language of our own (Raycast's lesson).

### What stays core

The canvas surface, selection, hand edit, the structural actions, drawing a placeholder or broken frame, the pane frame, the toolbar, the hotkey dispatcher and sheet, Home, the tab strip and window chrome, team management, stills.

### Not in v1

Canvas items that are not frames (a comment pin as an object, a sticky note). A layer draws; only frames are objects. Liam to confirm.

### Walked through on paper

- **Knobs**: section, frame part (`ui.knobs`), route, write lane, event (compiled).
- **Record**: command (player toolbar, context menu), play-mode hook for the recorder, verb, route, job.
- **Deck**: page kind, pane (slide list), section (notes), frame part (`ui.steps`), play mode with a presenter window, commands (Present, New slide, export PDF), guide, check, data (`notes.md`, a `canvas.json` key merged per entry).

### Words for GLOSSARY.md when the core is built

Extension; part (window, frame, daemon, cloud); slot; service; official extension; browser extension (the Chrome one; `extension/` becomes `browser-extension/`).

### agent, 2026-11-10T08:52:53.348Z

## Coverage check behind the resolution (read-only scout, 2026-11-10; the start of its table was cut)

[...truncated]
on.
Settings screens: setting, command; settings. MISSING: section/screen contributions for connection/setup UI not representable as a validated value.
Hotkey sheet: command; settings. MISSING: readable command/key/gesture registry and window-overlay host. Sheet should be core.
Booth/stills: verb, route; stills. MISSING: nothing if scheduling, browser ownership and viewport prioritization remain inside the stipulated core stills service.
Terminal/outside (outside.tsx): badge/layer/command, route, verb, setting. MISSING: harness hooks, daemon lifecycle/timers, transcript-derived events, native terminal reveal and window-space session lines. This file represents outside agents, NOT terminal frames.
Clipboard/copy placement: command; files, write lane, camera. MISSING: clipboard broker, structural copy receipts and ordered placement/selection after landing.
File/image drop: route/command partly; files, agent. MISSING: negotiated drop/paste ingress, coordinates, frame shielding and consumed/pass-through arbitration.
Context menu: command; selection/stores. MISSING: target-specific context snapshot, availability, grouping and stateful custom submenus (export is a multi-step menu).

B. GAPS, RANKED
Ranking is by breadth of reuse, not estimated implementation cost.

1. Window contributions: window overlay/status/screen slots. Covers finder, peek/path, faces, trail, shares, onboarding, settings, what’s-new and shell UI; distinguish window from canvas coordinates.
2. Lifecycle/events: scoped subscriptions plus ordered hooks for compile, document readiness, save, rename/delete, agent turn/tool/result and attention. Needed by graphs, unseen, knobs, agents, history, booth and sync UI. Explicitly distinguish observing from vetoing.
3. Structural actions/runtime access: should be core. Offer transactional create/copy/move/rename/trash/restore with undo receipts; gesture preview leases; hit testing, source/DOM measurement, document messaging and capture leases. Raw file writes cannot preserve canvas invariants.
4. Cloud extension host/data: cloud execution target plus authorized record/realtime services, audience context, schema migration and version compatibility. Comments/shares/presence/viewer/history cannot become daemon-only extensions.
5. Frame presentation: frame-content/decorations slot with geometry, label anchors, clipping and lifecycle. Badges cannot substitute for placeholders, broken rendering, located marks or history documents.
6. Ingress: broker for paste/drop/deep links/external routes, ordered matching, consume/refuse/pass-through and target context. References require a declared external-origin capability, not bypassing core checks.
7. Daemon lifecycle: extension start/project-open/watch/job/stop hooks with cancellation and bounded queues. Routes/verbs do not start background work; outside sessions, imports, recording and derived indexes need it.
8. Agent integration: event/thread/control service plus context-provider and agent-tool slots. A guide is instructions, not executable tools; “ask agent” does not expose permissions, queued messages, result-to-comment posting or contextual selection enrichment.
9. Alternate projection: projection provider with input/selection policy, old geometry/stills and restore actions. History currently overlays the historical page; treating this as an ordinary additive layer leaves present-day hit targets underneath.
10. Owned data: namespaced project files and machine storage need schema versions/migrations, rename/delete policy, team-sync semantics and export/share inclusion. Cloud records need their own authorized migration model.
11. Import/export: format-provider slots plus capture/compile/job/download services. Necessary for live PNG/PDF, HTML closures, project archives and foreign-file ingestion.
12. Notifications/onboarding: notify should include keyed actionable notices and progress; onboarding-step slot should declare prerequisites/completion. A toast string cannot express conflict resolution or installation.
13. Policy/interception: core-controlled arbitration for tool pointer ownership, hotkey precedence, writable/read-only projection, destructive-operation veto and transfers. Never give arbitrary listeners accidental veto power.
14. Canvas items: item-kind slot only if nonframes are intended as first-class objects; includes bounds, hit testing, selection, persistence, still/export behavior. Comments already pin empty world space; placeholders are sidecar-only projected items. Do not pretend a drawing layer grants either object semantics.

C. WHAT WINDOW SLOTS RECEIVE TODAY
All canvas references below are src/ui/canvas/canvas.tsx.

Pane: Pages at :5694 gets project/pages/frames/placeholders, selections, order, navigation, structural verbs, undo recorder, unseen, element subtree, drag carrier and peek state. Agent at :5773 gets width/visible from pane host, plus deck, requests, permissions, jump/pointing, installation/models/defaults. PaneDef also carries focus, working/waiting/unread metadata (:5762); not just React content.

Properties section: geometry via :5739 receives Held (frame/element/multiple plus geometry), ask and geometry write/preview/commit callbacks. Knobs via :5748 receives live knob lane, variant-name resolver and save-variant callback. Actual section wiring: properties-rail.tsx:204–205; there is no general section registry today.

Tool: CanvasTools at :6377 gets effective tool, chooseTool and team availability only. Real Comment behavior at :4025 and :4404 consumes asynchronous runtime pick chains, world/frame coordinates, store mutation, transient hold state and return-to-select; :871 also freezes documents. A button contract is not a pointer-mode contract.

Layer: FlowArrows at :5878 gets frames, derived edges, source-site boxes, camera. CommentsLayer at :6168 gets comment context, mutable canvas store, camera, frames/page, comments and agent-send callback. Layers mix CameraField-transformed content with independently screen-projected content; host must specify which.

Frame badge: FrameLabel at :6011 gets frame/near/camera/view store, entered/selected/hovered, unseen, broken, play, live-walk chip, overview and agent records. PlaceholderFrame at :5886 gets placeholder geometry/metadata, camera, agents and pointed state. Concrete embedded badge readers: frame-label.tsx:200 (UnseenMark), :214 (FrameAgentsMark). Neither is an independent extension seam yet.

D. PRIMITIVES
Eleven families: actions, inputs, selection, display, feedback, structure, navigation, overlays, dials, pickers, boxes; roughly 100 exported UI components, plus gesture/parsing helpers. Includes buttons/tools, fields/scrubbing, sliders/physics controls, colour/gradient/font pickers, menus/dialogs/palettes, trees/property rows, toast/progress/status and thumbnails.
src/design-lint.ts:63–80 scans chrome TS/TSX for raw colours and ad-hoc motion, and legacy tokens more broadly; :91–108 compares exact per-file debt allowances, which can only shrink. It does NOT enforce importing primitives or forbid bespoke controls/layouts.
Bespoke drawing remains: GPU pictures, frame shells/labels, selection rings/handles, flow arrows/exits, comment pins, presence pointers, history projection, overview, agent trail/marks, first-run glow/ripple, QR and recording cursor.

E. CUT
Command is not redundant with tool: a command invokes; a tool owns a continuing pointer interaction. Frame call is wrongly singular if it means only an RPC: knobs require runtime-local values plus messaging, and go/back require local session behavior. Layer needs explicit world-space and window-space hosts; frame badge is a constrained frame-decoration placement rather than a separate rendering universe. Keep properties sections distinct from panes, but share their contextual services. Page kind should determine page policy/layout, while play mode determines session interaction; their overlapping “how it plays” needs one declared precedence rather than two owners.

### agent, 2026-11-10T12:02:14.823Z

Liam confirmed (task 557, 2026-11-10): v1 leaves out canvas items that are not frames. A layer may draw them; only frames are objects.

### agent, 2026-11-10T12:57:54.227Z

## Amendments from the spike (#259, task 567, judged in task 557, 2026-11-10)

The spike moved knobs and flows with walk onto a tiny core as extensions that import only the SDK (branch `567-wayfinder-map-251-ticket-259-a`, `spikes/extension-core/`, never merged). The slots it used held: `section` took the knobs rail with only its imports changed, `layer` took the flow arrows and walk tags as they were, flows' graph matched today's `/flows` exactly (740 frames, 235 edges). Everything below is added or corrected; no slot it used had to be reshaped. Not exercised: pane, tool, frame decoration, ingress, page kind, play mode, the cloud part, hand edit, structure, team, covers and stills, the player.

**Corrections to the paper**

- The manifest is pure data. Parts are found by file name beside it (`window.tsx`, `frame.ts`, `daemon.ts`, `compile.ts`), not by `() => import()`: every host bundles from the manifest, so import thunks drag one part into another's bundle. The CLI reads manifests with no daemon running.
- Verbs are declared in the manifest (name, summary, args) so `--help` lists them with nothing running; the daemon part runs them and the CLI forwards.
- A fifth part, **compile**: a pure, versioned transform that is part of the cache key and runs in every compiler (the daemon's, the player's, spool.page's worker). Knobs needs it to stamp `ui.knobs` calls. It cannot be a daemon slot.

**New slots**

- **references** (daemon part): `{ find, rewrite }` over frame source for the names an extension owns (flows: `ui.go` and `data-go` targets). Core's structure transaction calls every participant inside the same write on rename and move, so one undo reverses both. This is the third kind beside observing and vetoing: taking part in a core transaction. Still to prove: one undo receipt, and trash and copy.

**New services**

- `frames.boot` (data handed to a document as it boots, per extension, across a walk), `frames.onDocument` (reloading, loaded, arrived, error, gone), `frames.post` and `frames.reload`.
- `session`: per-page state a walk carries. `ui.state` stays core.
- `changes`: core's change stream; and daemon-to-window `publish` for an extension's own events.
- `writes.plan(planner)`: core keeps the stamp and boundary checks, the landing and the undo patch; the extension plans only the characters.
- `undo.record`: a generic entry on core's one undo stack, replacing the canvas's typed history kinds.
- Per-extension machine-local storage (`project-store` in the manifest's data).
- `exports.html(start, also)`, `structure.duplicate`, `notify`; actions select, goToPage, flyTo, enter, leave.
- `memo` keyed by core's per-frame hash, for derived data: the extension's flow graph took 0.36 to 0.53 s warm against 0.06 s for today's, which caches edges by frame hash.

**Contracts decided here**

- Refusal codes: core's union stays closed; an extension's own codes are strings namespaced by its id.
- npm dependencies: "imports only the SDK" means nothing else from spool. An extension may bring its own npm packages, bundled into its parts. The SDK exports the parser with the loader as an argument (`sdk/source`), since tsx and ts parse generics differently, so knobs does not need its own.
- Frame call types: the SDK exports an augmentable `SpoolUi`; an extension adds its calls by module augmentation. A project's frame types therefore follow the extensions it uses.
- The SDK has an explicit public surface, not `export *` (the primitives' files collide on names). It also exports helpers that are neither primitives nor services: page-path functions, variant names, camera hooks, press-away.
- Core verbs record their own undo; a caller composes what happens after (fly to the copy).
- Export scopes invert: flows places "Export flow" and hands core's export the frames, so export knows nothing of flows. No extension-to-extension dependency was needed; `uses` stays in the manifest type, unused.

**Core needed, beyond the paper**

- A registry from iframe window to frame and document nonce: frames are sandboxed with opaque origins, so the message source is the only identity. Core owns each frame's documents (the current one and the held paint) and reload.
- A boot handshake per document (session plus each extension's boot data) and a runtime switch per document, so the old runtime and the new can run side by side.
- The import graph (`sources`, `framesUsing`) is core; only navigation edges are flows'.

**Handed to "What an extension is on disk" (#257)**

- Off is per part, and a frame part can never be off, because authors' code calls `ui.knobs` and `ui.go`. With flows' window part off, `ui.go` silently did nothing. The fallback must be defined: the frame part belongs to the project, the window and daemon parts to the machine.
- CSS: extension UI got its Tailwind classes only because the spike added its folder to the window's CSS build. An installed extension cannot join that build: ship CSS per extension, built against the theme roles, or allow only primitives and role classes.

### agent, 2026-11-10T13:18:34.779Z

Amendment from "The cloud part of an extension" (#262): an extension has four parts (window, frame, daemon, compile); there is no cloud part. Cloud reach is through services: `team.comments`, `team.presence`, `team.history`, shares, and a generic **live channel** (project-scoped or share-scoped). Data entries in the manifest take `share: "never"` (the deck's `notes.md`).

### agent, 2026-11-10T17:50:42.656Z

## Input for the core spec: deepseek-harness ("everything is a plugin"), researched in task 557, 2026-11-10

Liam asked for it to be weighed for the core. Not yet folded into the API; the core spec decides what to take.

# DeepSeek Harness → Spool

Repo confirmed: “everything-is-a-plugin”, powered by Cordis; breaking changes explicitly warned. Snapshot: `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`; links use master. [README][readme]

## 1. What remains outside plugins?
**Cordis is the kernel:** Context constructs a root fiber, service proxy/reflection, plugin registry, events and logger. Agent loop, sessions, tools and model adapters are plugins. Loader/Include are plugins too. [Context][context], [architecture][arch]

My count: `vendor/cordis/src/*.ts` **2,811 lines**, comments included, dependencies/tests excluded. This is not total boot infrastructure. Browser boot retains a non-plugin shell/static baseline (React, Cordis, stores, slots, primitives). [kernel tree][kernel], [client rules][client]

## 2. Plugin unit and lifecycle
- Runtime unit: `(ctx, config)` function, `{ apply }` object, or class. Function modules export `name`, `inject`, `Config`, `apply`; service classes default-export. Local plugins need no manifest. Loader imports/starts modules. [API][registry], [Entry][entry]
- Distribution: bundle manifest `dsh.bundle.patch` names YAML patches inserting potentially many plugins. A profile lists ordered bundles. Host+Client packages declare `dsh.client` and `/client`, not four filename-discovered parts. [publishing][publish], [client rules][client]
- Rows carry `id`, `name`, `config`, `disabled`, injections. IDs avoid remove+add remounts on unrelated edits. Disabled rows remain saved; groups support service isolation. [Entry][entry], [composition][composition]
- `inject` names **services**, not implementations. Consumers wait for readiness, independent of row order; provider loss unloads them, return reactivates them. Optional collaboration uses `ctx.get` or dependency-tracked `ctx.inject` children. [services][services], [API][registry]
- Fibers expose pending/loading/active/unloading/disposed/failed. Registrations/listeners/children are owned effects; external resources need `ctx.effect(() => disposer)`. Disposal awaits cleanup. Reverse-started async disposers run concurrently: sequence dependent cleanup inside one disposer. Retired services survive dependent teardown. [lifecycle][life], [service source][reflect]
- HMR is a plugin. Web/base defaults to config-only watching; source watching is opt-in, headless/SDK/ACP default to restart. Config/management changes serialize; installation runs outside that queue. Rollback varies: source replacement can restore implementations; installed-package reconciliation may leave failed replacements absent. [HMR][hmr]

## 3. Can plugins define extension points?
**Yes:** plugins define services, registries and typed events via declaration merging. Capability seams separate definition/provider/consumer. UI plugins declare child slots; only `root` is seeded. [services][services], [architecture][arch], [slots][slots]

Slot kinds: single/list/keyed/chain/hoc. Declarations claim render ownership. Undeclared contributions, duplicate declarations and incompatible store scopes fail on load; owner disposal collapses descendant registrations. [slots][slots]

## 4. Veto, observation, ordering, conflicts
`emit` ignores returns/promises; `parallel` awaits all; serial/bail stop at the first non-null/false/undefined result. Waterfall is around-middleware: skipping `next()` vetoes downstream execution. Request/tool/approval policy uses interception, unlike Spool's observe-only events. [event source][event-source], [architecture][arch]

Hooks use registration order and optional `prepend`, not general numeric priority. Missing `next()` silently swallows behavior. **Emit is not failure-isolated:** synchronous throws escape. [event source][event-source]

Conflicts are registry-specific: duplicate providers in one service realm and duplicate tools in one scope throw. UI sorts ascending priority, then order for list/hoc, stable ties; same-priority duplicate cells throw, different priorities explicitly shadow. Chains select first non-null match. [services source][reflect], [tools][tools], [slot source][slot-source], [slots][slots]

## 5. Configuration
`Config` combines TS type and runtime Standard Schema validator, normally Schemastery; validation/defaults precede apply. YAML supports executable `!!js`: **not pure data**. Volatile fields give stable `.get()` references; validated volatile-only changes avoid remounting, invalid updates retain running values. [config][config], [Entry][entry]

Order: profile bundles → profile patch → home patch → `--patch` overlays. Whole-config replacement. Profiles live under `$DSH_HOME/profiles/<name>` (web/headless/sdk/sdk-minimal/acp templates). No automatic repository config hierarchy is documented; project `.env` has restrictions. [app-boot][boot]

Agent presets compose child plugins; existing agents retain revisions, but restart uses current definitions. Settings derives forms from volatile Config fields, redacts secrets, rejects stale writes and persists profile overrides. [presets][presets], [Settings][settings]

## 6. Built-ins and boundaries
Todo injects services/registers a tool and replay projection; Bash consumes `ctx.shell`; web-search settings contributes to another plugin's slot. Same plugin idiom. [Todo][todo], [Bash][bash], [settings UI][settings-ui]

Not “SDK imports only”: built-ins import Cordis, validators, service/helpers and Node. Client features cannot value-import another feature: use DI/slots. Build/verifier gates enforce boundaries; dependency scans enforce package policy. HMR uses Node internals. [client rules][client], [boundary gate][gate], [HMR][hmr]

## 7. Trust, permissions, sandboxing
Host plugins execute **in-process outside the workspace sandbox**. Agent plugin management requires full-access/per-call approval; build-script approval is separate. Schema inspection imports trusted code; display metadata can avoid activation. [manager][manager], [app-boot][boot]

Subprocess confinement is a separate capability: read-only/workspace-write/full-access; unavailable enforcement fails closed. It shares host/kernel/filesystem, not VM isolation. No per-plugin sandbox/iframe boundary was established; safety disclaims guaranteed protection. [sandbox][sandbox], [client rules][client], [safety][safety]

## 8. API versioning/stability
Preview promises breaking changes, not append-only APIs. Admission prefers SemVer `engines.dsh`, otherwise DSH peer ranges; no constraints means none. Checks precede import at owned composition boundaries, not arbitrary `ctx.plugin()` calls. Exact plugin/runtime-version exemptions in `compatibility.json` do not carry over to upgrades. [README][readme], [app-boot][boot]

## 9. Clever, painful, unconfirmed
Clever: dependent teardown, effective-config dumps, schema-derived settings. Pain: missing injections silently wait; module and service graphs differ. [life][life], [boot][boot], [settings][settings], [composition][composition], [client][client]

[Discussion #11885](https://github.com/deepseek-ai/deepseek-harness/discussions/11885) reports a linked-plugin rename disposing old code before its replacement resolved, aborting an in-flight turn. Not reproduced; fix status unconfirmed. HMR docs acknowledge replacements stopping old code on failure. Source research only. [HMR][hmr], [README][readme], [boot][boot]

## Five additions worth taking for Spool
1. **Activation-owned effect trees on every side.**
   Own resources/registrations and retain providers through dependent cleanup. Disposal callbacks alone do not ensure this. [life][life], [reflect][reflect]
2. **Service readiness dependencies with visible blocked reasons.**
   Bind capabilities; suspend/rebind consumers, avoiding stale references and silent waits. [services][services], [composition][composition]
3. **Extension-owned child seams with ownership/cardinality checks.**
   Let panes declare typed subslots without growing core; reject ambiguous owners/occupants at load. [slots][slots]
4. **One validated config schema with explicitly live fields.**
   Derive forms, redact secrets, reject stale writes, avoid remounting for harmless preference edits. [config][config], [settings][settings]
5. **Inspectable composition plus activation preflight/recovery.**
   Show layers/blockers; resolve replacements before unload; distinguish enabled from active. [boot][boot], [manager][manager], [hmr][hmr]

## What argues against Spool's design?
Not small-core/official parity. It challenges fixed slots as the *entire* extension model, entry functions without lifetime/dependency contracts, and universal transparent HMR. [arch][arch], [slots][slots], [hmr][hmr]

Keep pure-data manifests, observe-only events and destructive-action arbitration: DSH makes different trust/interception tradeoffs. Contain observer exceptions. Separate durable document data from disposable contributions: recursive slot teardown does not establish “nothing lost when off”. [config][config], [event-source][event-source], [manager][manager], [slots][slots]

[readme]: https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md
[context]: https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/context.ts
[arch]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
[kernel]: https://github.com/deepseek-ai/deepseek-harness/tree/master/vendor/cordis/src
[client]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md
[registry]: https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/registry.ts
[entry]: https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/loader/src/config/entry.ts
[publish]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md
[composition]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/06-composition-and-hmr.md
[services]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/03-services.md
[life]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/02-lifecycle-and-effects.md
[reflect]: https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/reflect.ts
[hmr]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/hmr/README.md
[slots]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.md
[event-source]: https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/events.ts
[tools]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/src/index.ts
[slot-source]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/src/index.ts
[config]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/05-config.md
[boot]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.md
[presets]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset-registry/README.md
[settings]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/settings/settings/README.md
[todo]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/todo/tool-todo/src/index.ts
[bash]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/shell/tool-bash/src/index.ts
[settings-ui]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings-web-search/src/client/index.ts
[gate]: https://github.com/deepseek-ai/deepseek-harness/blob/master/scripts/verify-client-packages.ts
[manager]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md
[sandbox]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sandbox/sandbox/README.md
[safety]: https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md

### agent, 2026-11-10T18:18:23.816Z

## Amendments from the window designs (#258, task 572, 2026-11-10)

Liam picked the extensions page, onboarding, the notice and where things land (resolution on #258). The designs need these from the API, all accepted as additions; none reshapes a slot:

- **The manifest is `extension.json`**, not `extension.ts`: pure data that spool reads without running anything, so an extension that is off, waiting or not trusted yet can still be listed. Verbs stay declared in it.
- **The manifest lists what the extension adds**, one entry per piece with its slot kind and name. spool shows this before the extension is on (the switch's line, the notice, onboarding) and holds the extension to it: a piece that registers without being listed is refused.
- **Display data in the manifest:** icon, one-line description, author, the onboarding answer it belongs to, and an "on" and an "off" sentence.
- **Per install, kept by core:** origin (official, copied, linked with its path, added by an agent with which, where and when) and a **waiting** state, off until a person confirms, counted on Settings' Extensions item. Remove, Unlink and Export are core actions on an install, not extension code.
- **⌘K lists commands as well as frames**, each with a kind. The command slot already carries what it needs; find's list takes commands as a source.
- **A notice slot:** a persistent keyed line above the page with actions, owned by core and open to extensions. The trust question and "This project uses Deck" are its first users.
- **Order and authorship:** every piece an extension draws carries its extension's id; a side's head, tools, sections, menu items and ⌘K results sort spool's own first, then others by when they were switched on, with a divider between.
- **Onboarding** reads a map from each answer to the extensions it switches on, built from the manifests' answer field.

For the core spec (#274).
