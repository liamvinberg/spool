# #284 · Spec: spool as a core with extensions, and the new window (behind the experiment `new-window`)

- State: open
- Labels: ready-for-agent
- Parent: #251
- Created: 2026-11-11T10:15:03.102Z
- Updated: 2026-11-11T10:15:03.102Z

## Problem Statement

Every feature spool has is wired by hand into one 6,800-line window file, one 2,900-line daemon file and one frame runtime. A new feature means editing all three, each one makes the next harder, and nothing can be switched off: a person who only wants a canvas gets flows, knobs, record, comments and an agent pane whether they use them or not. Decks were built in modules of their own and still needed call sites in each of the three, because there is nowhere for a feature to plug in. Nobody outside spool can add anything at all.

Liam wants spool rebuilt the way pi is: a small core that is optimised hard, and everything else an **extension**, spool's own features included, built on one public API. The default is clean; a person adds what they make. Later that same API opens to extensions other people write.

## Solution

Spool becomes a **core** and **extensions**.

The core is what makes spool a canvas: frames (compiled, run on the render origin), the canvas surface (pages, camera, selection, moving and resizing, hand edit), files (`design/`, sync, the write lane, one undo stack), the player, the frame around panes, the toolbar, keys and menus. If spool is still a canvas with a thing switched off, that thing is an extension.

An extension is a folder: a manifest that is pure data, and up to four **parts**, one per place code runs (spool's window, the frames' render origin, the daemon, the compiler). Each part is handed that side's API and registers into **slots**: a pane, a tool, a layer on the canvas, a mark on a frame, a command, a page kind, a play mode, a call on the `spool` import, a daemon route, a CLI verb. An extension can own slots of its own that others fill. It imports nothing from spool but the SDK, and that holds for spool's own extensions too, which is what proves the API.

This spec builds stage two of the order decided on the map (#251, #260): the SDK, the hosts that run extensions on all four sides, and a **new window** written beside today's behind an experiment, with five features moved onto it as official extensions: Pages, Properties, knobs, flows and the deck. Today's window stays exactly as it is and stays the default until everything has moved (stage three).

For the person nothing changes until they switch the experiment on. Then spool opens the new window: the same canvas, looking the same, with an Extensions page in Settings where the five can be switched off and on, and nothing lost when one is off.

Everything about the API's shape was decided in the map's tickets and is restated here so this page stands alone: #256 (the slot list, with amendments from the spike, the cloud decision, the window designs and the deepseek-harness research), #257 (on disk, trust, defaults), #258 (the designs Liam picked), #259 (the spike; its code is on the local branch `567-wayfinder-map-251-ticket-259-a` under `spikes/extension-core/`, never merged, a reference to read and not to copy blindly), #253 and #254 (engine and audit research), #262 (the cloud), and the deck's build (#265), which is the shape an extension's modules should have.

## User Stories

People

1. As someone who uses spool, I want today's window to behave exactly as before while this is built, so that my work is never the test.
2. As someone trying the new window, I want it to look and feel like the one I know, so that the rebuild is invisible except where it is better.
3. As someone trying it, I want opening a project, panning, zooming and selecting to be at least as fast as today, so that "a small core optimised hard" is something I can feel.
4. As someone trying it, I want no flicker anywhere: opening a page, dragging, dropping, undoing, switching pages.
5. As a person, I want an Extensions page in Settings that lists what spool has, an icon, a name and one line each, with a switch, so that I decide what my spool is.
6. As a person, I want a switch to say in one line what it adds or takes out, so that I know before I flip it.
7. As a person, I want switching an extension off to remove everything it drew and leave my files untouched, so that off is safe.
8. As a person, I want a frame that calls something from an extension I switched off to still render, so that my canvas never breaks because of a switch.
9. As a person, I want each extension's things to sit in a fixed place with its icon, spool's own first, so that switching one on never moves the others.
10. As a person, I want an extension that cannot run to say why in plain words (it waits for the agent, it failed with this error), so that a dead switch is never a mystery.
11. As a person, I want one broken extension to never take the canvas down, so that I can switch it off and carry on.
12. As a person, I want undo to be one stack across everything, so that ⌘Z reverses the last thing whatever made it.
13. As a person, I want Pages, Properties, knobs, flows and decks to work in the new window as they do today.
14. As a presenter, I want decks to work exactly as they do in 0.55 when I am on the new window.
15. As Liam, I want Spool Beta to keep opening the window I can work in until the new one is ready, so that the beta stays usable.

Extension authors (spool's own agents first)

16. As an author, I want an extension to be one folder with a data manifest and a file per part, so that I can read what it is without running it.
17. As an author, I want each part handed one object with the slots and services of that side, so that the API is discoverable from its types.
18. As an author, I want everything I register tied to my extension's life, so that switching it off cleans up without code from me.
19. As an author, I want one way to own anything else I start (a timer, a socket, a listener), so that it is cleaned up too.
20. As an author, I want to add a call to the `spool` import with its types, so that frames can declare things my window part draws.
21. As an author, I want my frame call to have a declared fallback, so that frames work with my window part off.
22. As an author, I want a typed channel between my frame part and my window part, checked for me.
23. As an author, I want routes under my own prefix and verbs listed in `--help` with nothing running.
24. As an author, I want to take part in a rename or a move, so that names I own inside files are rewritten in the same step and the same undo.
25. As an author, I want to write to frames' source through the write lane with undo, planning only the characters.
26. As an author, I want to record an undo entry of my own on the one stack.
27. As an author, I want to declare a slot of my own that other extensions fill, so that Properties can take sections and Pages can take rows without the core growing.
28. As an author, I want to say which services I need and have spool start me when they are there.
29. As an author, I want my UI built from spool's primitives and theme, so that it looks like spool without effort.
30. As an author, I want a lint that fails when I import anything of spool's but the SDK, so that I cannot lean on private code by accident.
31. As an author, I want a test kit that runs my part against a fake core, so that I can test a slot without a browser.
32. As an author moving a feature in stage three, I want the five moved extensions as worked examples.

Spool itself

33. As a maintainer, I want the core to know nothing about any extension, so that the core stays small.
34. As a maintainer, I want a missing slot or service to be added to the SDK for everyone, never bypassed.
35. As a maintainer, I want nothing from a project or from `design/` ever loaded into spool's window, the daemon or the compiler.
36. As a maintainer, I want the frames, the player, the HTML export and spool.page's viewer to keep getting one `spool` module with every official frame call in it.
37. As a maintainer, I want the old window's tests to run against the new window as each piece arrives, so that parity is counted, not claimed.

## Implementation Decisions

**The line**

- **Core:** frames and their documents; the canvas surface (the field, pictures, mounting, freeze, labels, placeholders, broken frames); pages and going between them; the camera; selection (frames, the entered frame, picked elements); moving, resizing, snapping, arranging; structural actions (create, copy, move, rename, trash, restore, reorder) as transactions; hand edit; the write lane; one undo stack; who gets the pointer, the wheel and each key; the frame around panes (the rails); the toolbar; commands, keys, context menus and the key sheet; the player and stills; Home, tabs and the window's chrome; settings; team sync and the cloud's services.
- **Extensions:** everything else. In this spec: Pages, Properties, knobs, flows, deck. In stage three: find, history, export, record, references, presence, comments, the agent pane, and onboarding as it comes back.
- The core never imports an extension. An extension imports only the SDK, its own files, npm packages it bundles, and types (types only) from an extension it names in `uses`. Lint holds both rules, for official extensions too.

**An extension on disk**

- A folder with `extension.json` and up to four parts found by file name beside it: `window.tsx`, `frame.ts`, `daemon.ts`, `compile.ts`. Official extensions live in the repo's `extensions/<name>/` and ship inside the package and the Mac app. Loading anyone else's (from `~/.spool/extensions/`) is stage three; nothing here may assume official only, except where this spec says so.
- The manifest is data spool reads without running anything. It holds: `id` (`spool.*` is official), `name`, `api` (a whole number, 1), display data (icon, one-line description, author, the onboarding answer it belongs to, an "on" sentence and an "off" sentence), `uses` (extensions whose slots it fills), `needs` (services it waits for), `adds` (every piece it registers: slot and name; for a verb its summary and arguments; for a frame call its fallback), `slots` (slots it owns, each with a name and how many may fill it: one, a list, or one per key), and `data` (files it owns in `design/`, each with how sync merges it and whether a share may carry it; and machine-local storage).
- A part registers only what its manifest lists. A piece that is not listed is refused and the extension stops with that reason. This is what lets spool say what a switch adds before the extension has ever run.
- Each part's default export is a function handed that side's API. Sketch, from the spike with its amendments:

```ts
// extensions/knobs/window.tsx
import { defineWindow } from "spool/sdk/window";
import { KnobsSection } from "./knobs-section";

export default defineWindow((spool) => {
  spool.slot("spool.properties:section").add({
    id: "knobs",
    title: "Knobs",
    when: (held) => held.kind === "frame",
    render: KnobsSection,
  });
});
```

**Life of an extension**

- States: off; on and **waiting** (with the reason: a service in `needs` is not there, an extension in `uses` is off); **running**; **failed** (with the error). On is a setting; running is a fact. The Extensions page and `spool extensions` show the state and its reason.
- Everything a part registers or subscribes to through the API is owned by its activation. Anything else it starts goes through `effect(() => dispose)`. Stopping disposes in reverse order and waits for each. A slot's owner is kept alive until what fills it has stopped.
- A service that goes away (the team service when a project is not a team's, the agent service when no agent is installed) moves the extensions that need it to waiting and back, without a restart of spool.
- Extensions observe; they never veto. An event's listeners cannot stop or change what happened. The one way to take part in a core action is to be a declared participant in a core transaction (the references slot below), where core calls the participant and keeps the outcome whole.
- A throw in an extension never reaches the core: every contributed render sits in an error boundary that draws nothing; every listener and handler is caught. An extension that keeps failing is stopped and shown as failed.
- Parts load lazily: a window part when the window first needs one of its slots, a daemon part on the first call to its route, verb or lifecycle hook.

**Slots in this spec** (built now, because one of the five uses it)

Window:

- **pane** `{ id, title, icon, side, mark?, render({ width, visible, focus }) }`: a panel in the rails. Core owns the frame around it: open, close, width, order, the head with each pane's icon.
- **layer** `{ id, space: "canvas" | "window", order: "under" | "over", render }`: canvas space moves with the camera, window space sits on the screen. Takes the pointer only in regions it declares.
- **frame decoration** `{ id, place: "label" | "edge" | "over", when(frame), render({ frame, geometry, state }) }`.
- **command** `{ id, title, icon?, when?(target), run(target), key?, places?, children? }`: one named action placed on a key, a context menu (frame, canvas, page), the toolbar, a pane's menu. `target` is a snapshot of what it was invoked on. The key sheet reads the same registry.
- **tool** `{ id, title, icon, cursor, pointer: { down, move, up, cancel } }`: a pointer mode that owns the pointer on the canvas while chosen and hands back to Select.
- **page kind** `{ id, name, when(page), layout, policy, drag?, play, template? }`: what a page is when its folder says so. `policy` switches core behaviours for that page (guides, gap snapping, resize handles); `drag` lets the kind preview and decide a drop in place of free movement; `play` names its play mode.
- **play mode** `{ id, keys, host, windows? }`: what plays when a page of a kind is played or a frame on it is gone into: a stage hosted by core in the canvas, in a play window, and in windows the mode declares (a presenter view and a room), with one authority publishing numbered snapshots and the others following.
- **notice** `{ key, text, actions }`: one persistent line above the page.
- **setting**: an entry in the settings registry, as today.
- A slot an extension owns, addressed as `<owner id>:<name>`. In this spec: `spool.properties:section` `{ id, title, when(held), render({ held }) }` and `spool.pages:rows`, one per page kind, which gives a page kind its rows in the Pages tree.

Frame: a module loaded into the frame runtime on the render origin. It adds calls to the `spool` import (typed by augmenting the SDK's `SpoolUi`), may keep state in the runtime, gets boot data from its daemon or window part as a document boots, and a typed channel to its own window part. Messages are checked against the declared shape, the sender's ownership of its frame, and a size limit. It never holds a daemon capability. Every call has a fallback for when its window part is off: knobs read their declared values; `go` and `back` do nothing; `beats` reads as the last beat.

Daemon:

- **route** under `/x/<id>/`, always behind core's host, origin and capability checks.
- **verb**: declared in the manifest so `--help` lists it with nothing running; the daemon part runs it. A core verb can take an option an extension declares (the deck's `--beat` on `shot`), handed to that extension's frame part as boot data.
- **lifecycle** (start, project open, project close, stop), **watch** (paths under `design/`), **job** (a bounded queue with cancel).
- **references** `{ find, rewrite }`: names the extension owns inside files (flows: `go` targets; the deck: `deck.json`'s list). Core's structure transaction calls every participant inside the same write on rename, move, trash, restore and copy, and one undo reverses all of it.
- **agent guide** (a topic in `spool skill`) and **agent check** (rules in `spool check`).

Compile: a pure, versioned transform that is part of the cache key and runs in every compiler (the daemon's, the player's, the HTML export's, spool.page's worker). Official extensions only, as decided in #257: the compiler is trusted.

Named on #256 and built in stage three with the feature that needs each: ingress, onboarding step, settings section, agent context and agent tool, the projection service (history), the team services and the live channel, clipboard, stills.

**Services in this spec**

- **Stores**, read: the project, pages and the current page, frames with their geometry, selected frames, picked elements, the entered frame, the tool, the camera. **Actions**: select, go to a page, fly to, enter, leave.
- **Structure**: create, copy, move, rename, trash, restore, reorder, as one transaction with one undo receipt, references participants included.
- **Geometry**: preview, commit and batch, with undo.
- **Writes**: `writes.plan(planner)`: core keeps the stamp and boundary checks, the landing and the undo patch; the extension plans only the characters.
- **Undo**: `undo.record(entry)` on core's one stack.
- **Frames at run time**: boot data per document, document events (reloading, loaded, arrived, error, gone), post to a frame part, reload, measure (site boxes), capture and freeze leases.
- **Session**: per-page state that a walk or a talk carries. `ui.state` stays core.
- **Changes**: core's change stream; and `publish` from a daemon part to its window part.
- **Memo**: derived data cached by core's per-frame hash (the spike's flow graph needed it to match today's speed).
- **Storage**: the extension's declared files in `design/`, and per-machine storage.
- **Exports**: build an HTML file or a PDF from frames the caller names.
- **Notify**, **settings**, **play** (open the player on a frame or a page).
- Refusal codes: core's set is closed; an extension's own are strings under its id.

**The SDK**

- One public surface with explicit exports, one entry per part (`spool/sdk`, `spool/sdk/window`, `spool/sdk/frame`, `spool/sdk/daemon`, `spool/sdk/compile`) and a test kit (`spool/sdk/test`) that runs a part against a fake core.
- The window entry exports the primitives (about 100 components in 11 families), the icons, the theme's roles, and the helpers the spike found extensions need (page paths, variant names, camera hooks, press-away). Extension UI is built from them. Free drawing is allowed only in a pane's body, a layer and a frame decoration. Official extensions' classes join the window's CSS build; shipping CSS with an installed extension is stage three.
- `api` is 1. Slots are added, never reshaped. The API is promised stable only once every official feature lives on it; until then it may change with the features that move, and each change is made for everyone.

**The new window**

- An experiment, `new-window`, off by default, and **not** switched on by a beta build: the experiments registry gains a way to say so, since Spool Beta turns every experiment on and Liam works in it. In the beta it is switched on by hand in Settings. Stage three makes it the default.
- With it on, opening a project mounts the new window in place of today's. Home, the tab strip, the window's chrome, settings and the daemon are shared and unchanged. Both windows read and write the same project the same way.
- It is written new, in its own tree. Leaf modules of today's window that know no feature (camera maths, snapping, the picture layer, the frame shell) are imported as they are; anything that mixes a feature in is written again without it. Today's window file is not edited except to be chosen or not.
- It looks like today's window: the design is `app/spool-canvas` on the team canvas, with where extensions land from the picked designs (`app/spool-canvas--extensions`, `--extensions-prototype`, `--extensions-loaded`): each extension keeps a fixed icon in its side's head, spool's own first, then a thin divider, then others'; tools, sections, menu items and results follow the same order; switching one adds or removes it at the end and nothing else moves.
- **Who gets the pointer, the wheel and each key is one pure function** from what happened, where and the canvas's state to an owner: the canvas, a tool, a frame, a play mode's stage, a pane. Task 590 is settling the rule for frames (a frame at reading zoom is the app; Esc and command chords go to the frame first) and building it on today's window as a module with its tests; the new window takes that module. If it has not landed when the surface is built, the surface is built on the same seam with today's entered-frame rule as its policy.
- **Motion is held to the deck's standard**, because Liam reported flicker in the first deck build: one movement, one direction; a still or trembling hand changes nothing; previews change with a margin; a drop settles once; no picture is swapped for a placeholder or an older picture by a move, a write, a selection or a page change. Proven on captured frames.
- **Speed is measured, not claimed.** On spool's own canvas (about 740 frames) on the m1: time to open a project to the first usable picture, frame times while panning and zooming, memory after a minute, idle CPU. The new window must match or beat today's on each before the last ticket closes.

**Extensions page**

- Settings gains an Extensions page as designed (`app/spool-settings--extensions`): one list grouped by what you make, an icon, name, one line and a switch per row, the basics folded into "On for everyone", the one-line sentence on a flip, and the state when an extension is waiting or failed. In this spec it lists official extensions only. Add, Remove, Export, linking, the confirm for one that is not official, the notice for a project that uses one that is off, and onboarding's tiles are stage three.
- On and off is per machine, through the settings registry; `spool extensions` lists them with their states and switches official ones.
- Baseline, on from the start: Pages and Properties. Someone who already uses spool has all five on.

**The five**

- **Pages** (pane, commands, the `rows` slot it owns) and **Properties** (pane, the geometry section, the `section` slot it owns) are window-only and written for the new window.
- **Knobs**, **flows** and the **deck** each move whole: the daemon, frame and compile parts are moved, not copied, so there is one implementation, and today's window is repointed at the new routes. Only the window part exists twice until today's window is deleted in stage three. Their tests move with them.
- The deck is the proof of page kind, play mode, a references participant, an agent guide and check, and a slot owned by another extension. Its behaviour is spec #265 as shipped in 0.55 with its later fixes; nothing about it changes.
- The `spool` module that frames, the player, the HTML export and spool.page's viewer import is built from core plus every official frame part, so those consumers see no change. The types a project's frames are checked against are built the same way.

**The daemon**

- Extension routes, verbs, lifecycle hooks, watches and jobs mount through one registrar that carries authority (core's checks in front of every route) and lifecycle (everything is closed when the extension stops). The moved features' old routes are deleted. The rest of the hand-wired routes move onto registrars with their features in stage three.
- The daemon refuses to load a part from inside a project or `design/`, and in this spec loads parts only from spool's own package.

## Testing Decisions

A good test proves something a person or an extension author relies on, once, at the cheapest level that shows it. The repo's rules in `AGENTS.md` apply.

- **The host, as functions:** reading a manifest (and refusing a bad one with a reason a person can read); the state machine (off, waiting, running, failed) through services coming and going; cleanup in reverse order with owners outliving what fills them; a piece not listed in `adds` refused; a slot filled by too many refused; a throw contained.
- **The SDK contract, through the test kit:** one small fixture extension per slot, run against the fake core, proving what the slot is handed and what registering does. The kit is public, so these tests are also its proof. The lint rules have their own cases.
- **The daemon, over a fixture `design/`:** a fixture extension's route behind core's checks, its verb listed with no daemon and run with one, its watch and job, and a references participant taking part in rename, move, trash, restore and copy under one undo. Loading from inside a project refused.
- **The frame side, in a browser:** a fixture frame part adds a call, a frame uses it, the window part hears it; with the window part off the fallback holds; a message of the wrong shape, from the wrong frame or too large is dropped.
- **The new window, in a browser:** today's browser suites for the canvas are the parity list. Each ticket names the suites that must pass against the new window, run by a switch in the test setup, with no change to what they assert. Suites for features not yet moved stay on today's window.
- **Motion, on captured frames:** opening a page, pan and zoom, select, drag, drop, undo, switching pages, switching an extension on and off: no blank, no picture swapped back, no position reversed. Prior art: the deck's stage suite and the flicker suite from #283.
- **The moved features:** their existing tests, moved with them, passing against the extension. Flows' graph must equal today's on spool's own canvas, as the spike showed (740 frames, 235 edges).
- **Today's window:** every existing suite passes untouched after each ticket, apart from the repointed routes.
- **On the m1,** in the Mac app, as the last ticket: the new window with the five on, a real working session, each one switched off and on, the speed numbers, with screenshots and anything that glitched written down as seen.

## Out of Scope

- Extensions that are not official: `~/.spool/extensions/`, add, link, remove, export, built bundles with their own CSS, the confirm in the window, the frame part copied into a project, the `extensions` key in `canvas.json` and its notice, onboarding's tiles. Stage three; decided in #257 and #258.
- Moving find, history, export, record, references, presence, comments and the agent pane. Stage three. Until then they exist only in today's window.
- Making the new window the default, and deleting today's window.
- The rework inside team sync and inside the compiler's graph and caches (#254). Each gets its own spec; this one needs neither, and changes nothing in sync.
- The cloud: the team services as SDK services, the live channel, decks on spool.page (#262).
- A store, and a sandbox or permissions for extensions. Installed means trusted (#257).
- Canvas objects that are not frames. A layer may draw; only frames are objects (Liam, #256).
- Cleaning up the frame SDK's own calls (`ui.state`, `use`, `copy`).
- Any change to how spool looks or behaves in today's window.
- Calling the Chrome extension the "browser extension" in the product's own words. That happens in stage three, when "extension" first shows for everyone. Its folder is renamed now (`extension/` to `browser-extension/`), so that it does not sit beside `extensions/`, and the glossary takes the words now.

## Further Notes

- Words for `GLOSSARY.md`: Core, Extension, Part (window, frame, daemon, compile), Slot, Service, Official extension, Browser extension (the Chrome one), Waiting, Participant.
- Taken from the deepseek-harness research (#256): slots an extension owns, with who may fill them checked at load; services an extension waits for, with the reason shown; one owner for everything an extension starts; on is not the same as running. Left out on purpose: middleware that can veto, configuration that runs code, and unloading an extension before its replacement has started.
- What building the deck taught, to carry over: the 1.5 s between a walk and the next frame was the stylesheet waiting on the daemon's compile; a stage that any host can mount is the right shape for a play mode; a change applied whole by one daemon operation with a journal is what a participant in a transaction needs; own modules with call sites only made the deck liftable.
- The team canvas is out of git and syncs to the team. Since #243 a worktree that fetched it can be removed safely; run `pnpm -s dev remove <path>` first when removing one by hand.
- Each ticket lands on main behind the experiment as it goes green. A changeset is added when something a person can reach changes: the experiment itself, the Extensions page, `spool extensions`.
- Builders bring any choice this spec and its tickets do not settle to task 557 before building it. Adding a slot or a service the list does not have is such a choice.
