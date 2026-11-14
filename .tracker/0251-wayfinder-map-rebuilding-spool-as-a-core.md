# #251 · Wayfinder map: rebuilding spool as a core with extensions, the deck first

- State: closed (superseded by map #333)
- Labels: wayfinder:map
- Tasks: task 557 (Spool presentations and extension core)
- Created: 2026-11-10T08:20:58.024Z
- Updated: 2026-11-13T14:47:31.339Z
- Closed: 2026-11-13T14:47:31.339Z

## Destination

Specs ready to hand to builders for a rebuilt spool: a small **core** with an **extension API** that spool's own features are built on, the new window on that API, and the **deck** (presentations) as the first official extension, plus a decided order for rebuilding and moving today's features over. The API is meant to go public later (installable extensions, a store), so it is designed as a public SDK from the start.

## Notes

**Skills.** Anything visual is designed with the loom skill as live frames on the team canvas (`design/`, `pnpm -s dev skill`, `design/AGENTS.md`), never as mockup images. Decision tickets use grilling and domain-modeling (`GLOSSARY.md`). With Liam: plain language, answer first, numbered questions each with a recommendation, no em-dashes; engineering calls are the agent's to make and explain, product and taste calls are his.

**UI is prototyped first.** Anything touching UI is designed in spool as live frames before it is built, so Liam sees the microinteractions: clean, smooth, performant, not bloated (task 557).

**Threads.** A thread is closed once its work is done and Liam is not needed in it.

**How to weigh things.** The size of a rewrite is not a cost here. Liam: "you dont have to be scared of rewriting, wiping code and just writing", "we can think of this as rebuilding spool". Weigh only whether it makes spool better: cleaner, leaner, faster, more extensible. Everything gets looped, validated and tested on the m1.

**Settled before the map** (agent-hub tasks 201, 215, 449 and 557; read them with read_task for the reasoning):

- Engine stays web plus Electron. Rune, GPUI and a Rust/WebGPU rewrite were turned down (tasks 449, 141): frames are live React and CSS and need a browser.
- One spool, not a sibling product. Everything stays a live TSX frame.
- Shape: a small core plus **slots** (fixed places a feature plugs into: pane, properties section, tool, canvas layer, key, menu item, frame call, daemon route, CLI verb, setting). Every feature is an **extension**, spool's own included, and spool's own use only the public API, which is what proves the API. The mindset is pi's (pi.dev): a small core that is optimised hard, everything else added. The feel for people is Raycast's: install what you need.
- Core is what the rest stands on: frames (TSX, compiled, run on the render origin), the canvas (pages, order, camera, selection, hand edit), files (`design/` on disk, team sync, the write lane and undo), the player. Rule: something is an extension if spool is still a canvas with it off. Knobs, record, export, find, references, history, presence, comments, flows, the agent pane and the deck are extensions; the agent pane moves last.
- Default spool is clean and unbloated. Official extensions are chosen by the person, with an onboarding step that offers the popular ones, the deck among them (Liam, task 557).
- Trust: an extension someone installs runs in spool's window with full power, as in pi, VS Code and Raycast. Nothing inside `design/` ever runs in the window, because `design/` syncs to teammates and agents write it (ADR 0007). An extension has two halves: a window half (installed) and a frame half that runs on the render origin and can travel with the project, so spool.page can play a deck for a viewer with nothing installed. Frames declare, the window draws, as knobs do (ADR 0012).
- A deck is a kind of page on the same canvas: ordered layout plus a play mode that steps, notes per slide, a slide list, a presenter view, Enter stepping inside a live slide. "New presentation" is a starting template, not its own file type, so a slide can hold a live prototype frame from another page.
- Rewrite: the window (`src/ui/canvas/canvas.tsx` and the chrome around it) is written new beside the old one behind an experiment switch, and the daemon's route wiring too. Sync and compile are audited by a ticket here and decided on evidence.
- Order Liam leans to: presenting first (the player gets modes), then the new window proven with knobs, record and the deck, then the rest moves over. The last ticket settles it.
- Audience: people who work through a coding agent, but the UI must not feel devvy. Non-devs install extensions with a click.

**Sources.** Ticket #129 (the earlier presentations ticket, with code facts in its comments), #216 (image storage). The first comment on this map holds a code map from 2026-11-09.

## Decisions so far

- The core spec is written (2026-11-11): [spool as a core with extensions, and the new window](https://devobee.tail9e5223.ts.net/spool/tickets/284), with tickets #285 to #294. It builds the SDK and the hosts on all four sides, a new window behind the experiment `new-window`, and moves Pages, Properties, knobs, flows and the deck. Not started: it waits for Liam's go.

- Decks shipped in spool 0.55.0 (2026-11-11) behind the experiment `deck`: spec #265 with #266 to #273 and #275, fixes #277, #278, #281. Proven in the Mac app on the m1, two displays included. Stage 1 of the build order is done; the core spec (#274) is next.

- [The open-ended window and the extensions screen](https://devobee.tail9e5223.ts.net/spool/tickets/258): a plain Extensions page in Settings (switches grouped by what you make, Add extension… copies a folder or .zip into `~/.spool/extensions`, export your own, linking CLI only, no search yet); onboarding's answers are tiles holding their extensions; the notice is a line over the page; each extension keeps a fixed icon in its side's head. Frames under To build in `design/frames/app/`.

- [What gets rebuilt, and in what order](https://devobee.tail9e5223.ts.net/spool/tickets/260): presenting now, on today's code under the experiment `deck` (spec #265); then the core and the new window as one spec; then the rest moves over; then decks on spool.page.

- [The cloud part of an extension](https://devobee.tail9e5223.ts.net/spool/tickets/262): none. The cloud is platform; team features' UI becomes extensions over SDK services; extensions get a live channel; following a presenter by link is a share-scoped channel open to anyone with the link, carrying slide and step only; `notes.md` is never shared; spool.page must follow spool's releases.

- [What an extension is on disk, who is trusted, what is on by default](https://devobee.tail9e5223.ts.net/spool/tickets/257): official extensions ship inside spool, your own live in `~/.spool/extensions/`, never in a project; installed means full power, and one that is not official needs a person's confirm in the window; the frame part follows the project, window and daemon parts are on per machine, the compile part is official only; a project names what it uses in `canvas.json`; one notice when one is off; a baseline is on from the start and onboarding asks what you make; nobody loses a feature on update.

- [A spike: a tiny core with knobs and flows moved onto it](https://devobee.tail9e5223.ts.net/spool/tickets/259): the slot list held for what it used; added a compile part, a references participant (taking part in a core transaction), and services (boot data, session, changes, document events, planned writes, generic undo, memo); the manifest became pure data. Amendments are on the slot list ticket. Reference code on branch `567-wayfinder-map-251-ticket-259-a`.

- [The slot list: spool's extension API on paper](https://devobee.tail9e5223.ts.net/spool/tickets/256): an extension is a folder with up to four parts (window, frame, daemon, cloud); about 20 slots after a coverage check of every surface spool has today; services, six rules (SDK-only imports, additive slots, observe not veto, nothing lost without the code, primitives for UI, React); "extension" is the word and the Chrome one becomes the browser extension.

- [How others shape their extension APIs](https://devobee.tail9e5223.ts.net/spool/tickets/252): take host-drawn UI written in React (Raycast) and Figma widgets' model for shared projects (declared UI, effects only on the client that acted); a sandboxed runtime is not a permission model (Raycast, pi); bundled extensions often lean on private APIs (VS Code's Git), so parity has to be enforced; projects sync which extensions they want, running one is each machine's own consent; missing extensions must lose nothing.

- [Sync and compile: what a rebuild would gain](https://devobee.tail9e5223.ts.net/spool/tickets/254): the audit says rework both inside rather than replace: split team sync's lifecycle from its disk and socket effects, share dependency analysis across compile paths, give caches budgets; one suspected stale-cache defect, not reproduced. The decision itself is taken in "What gets rebuilt, and in what order".

- [What the engine must change for slots and the deck](https://devobee.tail9e5223.ts.net/spool/tickets/253): one player controller with modes over two renderers; a presenter needs one authority sending snapshots; page kind is a new `canvas.json` key that sync must merge per entry; notes in a sibling `notes.md`; one pure reader of `design/`; ordered layout computed, not written; registrars need authority and lifecycle; the cloud viewer pins its own spool version, so hosted decks are a separate rollout.

- [The deck's look and feel](https://devobee.tail9e5223.ts.net/spool/tickets/255): `deck-line`, adopted as `app/spool-deck`. A deck is a page whose top row plays, marked by a quiet band; every other frame sits loose in a grid and variants are not a concept (drag onto a slide trades, between two inserts, off the band takes out). The room's screen shows only the slide; presenting and an entered slide share one ladder of presentation keys. This changes a note above: ↵ means next, and ⇥ (not Enter) hands the keyboard to a live slide. Beats and carrying a shared element are the agent's craft through frame calls; carrying a live object between slides needs a layer in the player that outlives slide changes, left for later. Hard requirements for the player: the next slide is loaded before →, and the room never sees an error.

## Not yet specified

- From deepseek-harness (notes on the slot list ticket): extension-owned sub-slots, service readiness, one cleanup handle per extension, enabled versus running. To be folded into the API by the core spec.
- Whether every frame in spool should fly back on Esc as a deck slide does. A taste call for Liam, to prototype.

- Onboarding coming back, itself as an extension, with the step that picks extensions.
- Which of today's tests carry over, and how parity with the old window is proven before it is deleted.
- How the API is versioned and when it is promised stable.
- How agents learn to write an extension (skill text, types, examples).
- Configuration: per machine, per project, per team.
- The frame SDK itself (`ui.state`, `use`, `go`, `back`, `copy`, `knobs`): whether it is cleaned up or consolidated once each call belongs to an extension's frame part (Liam, task 557: later).
- Canvas items that are not frames (pins as objects, sticky notes): not in v1 of the slot list.
- Other kinds on the same core: film (a clock, export), print.
- Image and large asset storage for decks (#216).

## Out of scope

- A public store where others publish: hosting, review, payments. V1 has official extensions and a way to install; the install shape is in scope, the store is not (Liam, task 557).
- Switching engine (Rune, GPUI, Rust). Turned down in tasks 449 and 141.

## Comments

### agent, 2026-11-10T08:20:58.672Z

## Code map, 2026-11-09 (main at 3ff51cb5), from a read-only scout in task 557

**Features and how they attach to `src/ui/canvas/canvas.tsx`** (6,605 lines; count = lines there naming the feature):

- Knobs: ui, runtime, daemon, disk; about 1.9k lines; 22. `use-knobs.ts:80`, a properties section, runtime messages, a daemon hand route. Fairly liftable; shares the undo and hand-write lane.
- Record: ui, runtime, daemon, cli, disk; about 1.8k plus the shared player; 36. `runtime/player-recorder.ts:80`, a context-menu item, the player toolbar, a CLI verb. Rendering is in `daemon/record.ts`.
- Export: about 1.7k; 7. Find: ui only, about 1.4k; 76. References: about 3.8k with the Chrome extension; 4. Set-aside: about 400; 5.
- History: about 3.7k; 72. A pane, routes, a verb, but a historical projection replaces the live canvas. Git history and team history are different systems.
- Presence: about 2.2k; 43. Depends on camera, page, entered frame, drags, agents.
- Comments: about 4.4k; 139. Pane, tool, layer, routes, verbs; woven with selection, navigation and agent handoff.
- Flows and walk: about 1.9k plus shared runtime; 109. Session, navigation and entered-frame state are deeply shared.
- Hand edit: about 3.7k plus `frame-shim/edit.ts`; 95. Woven through element selection, freeze, reloads, fingerprints, undo.
- Agent pane: about 26k; 169. Canvas asks, selection, placeholders, repairs, permissions and presence reach beyond the pane.
- Pages: about 3k; 383. Foundational: identity, filtering, drag, session state.

**Seams that already exist:**

- `PaneDef` (`pane-window.tsx:59`), list accepted at `:206`, built by hand at `canvas.tsx:5686`; hotkey ids are a closed union.
- Properties: `properties-rail.tsx:201` hard-wires geometry then `KnobsSection` (`:205`). No section registry.
- Hotkeys: `ui/hotkeys.ts:149` a data list with closed ids; `hotkey-dispatch.ts:35` open handler layers over it.
- Context menu: `context-menu.tsx:44`, handwritten items. Tools: `canvas-tools.tsx:6`, a closed union of four. Layers: handwritten JSX order in `canvas.tsx` (5878 flow arrows, 6050 walk, 6112 overview, 6157 presence, 6168 comments).
- Daemon: `app.ts:1454-1797` and `:2140-2378` mount Hono route factories by hand with injected dependencies. CLI: Commander chains from `cli.ts:127`.
- Settings: `settings/registry.ts:160`, one entry drives validation, API and UI. Experiments: `settings/experiments.ts:36`. Both declarative, closed at compile time.

**Across the two origins:** `runtime/knob-protocol.ts`, `walk-protocol.ts`, `clipboard-protocol.ts`, the canvas bridge (`ui/canvas/protocol.ts:219-259`, `:479-624`; `frame-runtime.ts:549-610`), and the player's private MessagePort (`player-shell-runtime.tsx:503`, `:592-970`). The canvas checks that a message's source owns the iframe it claims (`canvas.tsx:3444`). Validation is not uniform. The `spool` import (`runtime/spool-public.ts`) gives frames `ui.state`, `use()`, `go()`, `back()`, `copy()`, `knobs()`.

**Knobs end to end:** the compiler stamps the `ui.knobs` call site; the runtime cleans the schema and posts it; the canvas checks ownership and stores it; trusted controls draw it; values post back live; on release `hand-routes.ts:297` writes the literal into the TSX through the fingerprinted hand lane, with undo.

**Player:** `daemon/play.ts:27` and `player-compile.ts:25` compose every frame into one render document (same-document view transitions); it is page-blind (`play.ts:90`). Three surfaces: the local shell, the Mac play window (`player-page.ts:31`), and the cloud viewer's `ViewerPlayer` (`ui/viewer/viewer-player.tsx:40`), which swaps iframe documents and is a different implementation. Its only key is the leave chord (`player-chrome.tsx:126`).

**Order:** `canvas-fields.ts:8` keeps ordered pages and ordered frames per page in `design/canvas.json`, separate from x and y; `order.ts:66` reconciles. `canvas-file.ts:69` preserves unknown keys. `frame.json` holds x, y, w, h and placeholder data. Pages are folders.

**`canvas.tsx` by range:** 459-1000 stores and state; 1000-1642 document lifecycle; 1643-2265 camera, play, geometry, trash; 2266-2945 element selection and drag; 2946-3436 page and camera sync; 3437-3822 the frame-message dispatcher; 3823-5353 wheel, pointer, drag, hotkeys; 5354-5815 rail state and panes; 5816-6440 render tree. Shared state: frames, pages and current page, selected frames, picked elements, entered frame, tool, edges (`canvas-store.ts:27`) and camera (`camera-store.ts:29`), instances made at `canvas.tsx:477`.

**Two readers:** `daemon/projection.ts` (848 lines, real disk, may write placements, covers, unseen) and `daemon/design-projection.ts` (124 lines, pure, used by shares and spool-cloud). They overlap in classification, sidecar parsing and placement rules.

**The scout's read:** the strongest boundaries already sit below the canvas (route factories, stores, the compile host, settings). Registering panes alone will not lift feature behaviour out of `canvas.tsx`.

### agent, 2026-11-12T13:04:33.710Z

## The road to 1.0.0 (task 634, 2026-11-12)

Liam, 2026-11-12, in task 557: "lets just keep it in beta for now, i dont want to release these things, main pushes it to beta, so one idea is that i fix things, redo probably spool into like the new extensible system until its stable and in my beta builds i can test, and then when i feel its ready a v 1.0.0 maybe where i keep developing in beta builds ofcourse".

This replaces point 3 of #260's resolution where it said "the old window is deleted one release later". There is no release in between: the released app stays at 0.56.0, everything lands on main and reaches Liam through Spool Beta, and the next release is 1.0.0 with the new window as the only one.

**The order**

1. Spec #284 (stage two): the new window behind the experiment `new-window`, one switch away in Spool Beta, with Pages, Properties, knobs, flows and the deck moved. When #294 passes, today's window takes fixes only.
2. Stage three, its own spec: find, history, export, record, references, presence, comments, the agent pane and onboarding move. Then the new window becomes the default in the beta, and Liam and his test people live in it.
3. Today's window is deleted on main: `canvas.tsx` and the window parts that existed twice, the lint allowance for today's tree, the switch in the test setup, and the experiment `new-window` itself.
4. 1.0.0.

**What the cut-over needs, for stage three's spec**

- **Experiments graduate.** `deck` and `knobs` stop deciding whether a feature exists; the extension's switch does. A stored experiment value becomes the switch's value, so someone who had decks on still has them.
- **A 0.56.0 setup opens cleanly, proven by a test**: a state folder (`~/.spool`: `config.json` with its settings and experiment values, the rest of the files there) and a project saved by 0.56.0, opened by the 1.0.0 candidate. Settings keep their keys (`present.way`, `export.talk`); the panes' remembered layout (`spool.panes.layout` and `spool.rail.agent.width` in the window's local storage) is read or reset without a broken rail; every extension is on for someone who already uses spool. Nothing in #284 changes the project's files or sync, so no format upgrade should be needed; if stage three needs one, it goes through the Upgrade consent that exists.
- **People on 0.56.0** get no fixes until 1.0.0, then jump straight to it: the Mac app updates itself from the same feed (`updates.spool.page`), npm on the next install. Prove the update from an installed 0.56.0 to the candidate before publishing. A teammate still on 0.56.0 and one on 1.0.0 must sync on the same team canvas. spool-cloud takes the 1.0.0 package (its compiler and the frame runtime it serves) in the same step.
- **The changeset**: one `major`, written at the cut-over, as `docs/releases.md` says 1.0.0 is cut. The patches already waiting in the release PR (#433) come along. Work behind `new-window` adds none on the way.
- **The API's promise starts here.** #284 says `api: 1` is stable only once every official feature lives on it. That is 1.0.0: from then a breaking change to the SDK is a major version.
- **Words**: "extension" shows to everyone for the first time, so the Chrome extension becomes "the browser extension" in the product's words.
- **Open for Liam, when stage three is shaped**: whether 1.0.0 also needs extensions that are not spool's own (adding one from a folder, #257 and #258), or whether that follows 1.0.0.

### agent, 2026-11-13T14:47:31.339Z

Closed on 2026-11-13 by task 634. Liam decided to rebuild spool from the ground up, deciding the foundation again "as if we didnt decide anything yet". The new map is #333; this map's tickets and its spec #284 are its evidence (ticket #336 reads them). The "road to 1.0.0" comment above describes the plan that was dropped.
