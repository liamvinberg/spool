# #257 · What an extension is on disk, who is trusted, what is on by default

- State: closed
- Labels: wayfinder:grilling
- Parent: #251
- Blocked by: #252
- Tasks: task 557 (Spool presentations and extension core)
- Created: 2026-11-10T08:20:58.422Z
- Updated: 2026-11-10T13:18:34.831Z
- Closed: 2026-11-10T13:03:13.081Z

## Question

What is an extension on disk, how does one get installed and trusted, and what is on by default?

Settle:

- The package: what it holds, where it lives on a machine (never inside `design/`), how the daemon and the window load it.
- Trust: installed means full power in spool's window. What stops a synced project or an agent from getting code in there.
- The frame half: where it lives so that it travels with a project and plays on spool.page for a viewer with nothing installed.
- A project that needs an extension a teammate lacks: how the project names it, what the teammate sees, what still works.
- What ships with spool and what is on by default. Liam wants the default clean, with an onboarding step that offers the popular ones (deck included). Which of today's features are on from the start (comments, history, the agent pane) is open.
- Install in V1 without a public store: official extensions, and installing one from a folder or a package.

Input: the research on how others shape their APIs.

## Comments

### agent, 2026-11-10T12:57:54.368Z

Inputs from the spike (#259), see the amendments comment on #256: (1) a frame part can never be switched off, since authors' code calls it, so on and off need a rule per part: the frame part belongs to the project, the window and daemon parts to the machine, and each frame call needs a defined fallback when its window part is off; (2) an installed extension cannot join the window's Tailwind build, so its CSS ships with it, built against the theme roles; (3) extensions may bundle their own npm packages; (4) the manifest is pure data and parts are found by file name.

### agent, 2026-11-10T13:03:13.081Z

## Resolution (task 557, 2026-11-10)

Liam's three calls: **baseline** on from the start, extensions on **per machine**, and a teammate without an extension gets **one notice** offering to switch it on. He added a standing rule: anything touching UI is prototyped in spool first, so he sees the microinteractions (clean, smooth, performant, not bloated). The rest are engineering calls made here, with the spike's findings (#259, amendments on #256) folded in.

### On disk

- **Official extensions** live in spool's repo under `extensions/<name>/` and ship inside the published package and the Mac app. They are always installed; switching one on is a setting, with no download.
- **Your own** live under the instance's state folder, `~/.spool/extensions/<id>/`, as a built package: the manifest as data, and one bundle per part (`window.js` with its own CSS built against the theme roles, `frame.js`, `daemon.js`, `compile.js`). An extension may bundle its own npm packages.
- **Never in a project.** The daemon refuses to load an extension from inside `design/` or any project folder.
- V1 verbs: add (from a folder: builds and copies), link (a folder under development, rebuilt on change), remove, list. No store and no npm install in v1.
- Loading: manifests are read at start as data. The daemon part loads in the daemon, lazily. The window part is served to spool's window only for extensions that are on. The frame part is served on the render origin. The compile part is loaded by each compiler.

### Trust

- Installed means full power in spool's window and daemon, as in pi, VS Code, Raycast and Obsidian. The install screen says so plainly; capabilities a manifest declares are shown, not enforced, in v1.
- Switching on an extension that is not official takes a person's confirm in spool's window. The CLI can add one, but it stays off until confirmed, so an agent or a script cannot get code into the window by itself. Official ones can be switched by setting or CLI.
- A project can name extensions. It can never carry window, daemon or compile code, and nothing synced ever switches anything on.

### The parts that follow the project

- The **frame part** belongs to the project, not the machine: authors' frames call it (`ui.knobs`, `ui.go`), so it can never be off. Official frame parts ship with spool, and spool.page's viewer has them at the version it pins. A non-official frame part is copied into the project when the extension is first used there, pinned by version, in a place sync carries, and only ever runs on the render origin, as frames do. This is specified for v1 and may be built after it.
- The **compile part** runs inside the compiler, which is trusted (the daemon, spool.page's worker). So it cannot travel in `design/`: official only, until a sandboxed compile is designed. A project needing a compile part the machine lacks compiles without it, and the frame call falls back.
- **Fallbacks are part of the contract.** Every frame call declares what it does when its window part is off or missing: knobs read their declared values; `go` does nothing and raises the notice.

### A project names what it uses

- A key in `design/canvas.json`, `extensions`, one entry per id with the API number and version, merged per entry by sync (today only `places` merges per entry; the sync rework must cover this). It is written when an extension's data first appears in the project, not by hand.
- Opening a project that uses an extension that is off or absent on this machine: one keyed notice, "This project uses Deck. Switch it on?" Official: one click. Not installed: what it is and where it comes from; never installed or switched on by spool itself. Dismissed once per project and machine. Joining a team project offers comments and presence the same way.
- Without it nothing is lost: the data stays on disk and readable, a deck page shows as a plain page with its frames placed by order, `notes.md` stays.

### On and off

- Window and daemon parts: per machine, through the settings registry, as Raycast does. No per-project switch in v1.
- Frame and compile parts: loaded whenever the project uses the extension.
- Switching off removes every registration; data is never removed.

### What is on from the start

- **Baseline:** Pages, Properties with geometry, find, history, export: whatever a person would call broken if it were missing. Hand edit is core.
- **Onboarding asks what you make, not which extensions you want.** Prototypes switches on flows, knobs and record. Presentations switches on the deck. Where your agent works (in spool, or in your terminal) decides the agent pane. References are offered when collecting from the web comes up. Team features are offered on joining a team project.
- **Nobody loses a feature on update.** Someone who already uses spool keeps everything they have today switched on.

### Versions

Official extensions version with spool. Others carry the API number they were written against, checked at load; a mismatch leaves the extension off with a notice. Pinned, no automatic updates in v1.

### agent, 2026-11-10T13:18:34.831Z

Note from the cloud scout (#262): sync carries only `canvas.json`, AGENTS/CLAUDE files and non-dot paths under `frames/` and `shared/`. A frame part copied into a project must sit under `shared/` or the whitelist must grow; a root `extensions/` folder in `design/` would not travel.
