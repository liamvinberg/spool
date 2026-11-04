# #51 · Rethink starting a project and the Home view

- State: closed (shipped in 0.49.0)
- Tasks: task 223 (Rethink new project flow)
- Created: 2026-10-18T17:43:55.776Z
- Updated: 2026-11-03T08:57:23.992Z
- Closed: 2026-11-03T08:57:23.992Z

Opened 2026-10-05 as an idea; grilled 2026-10-22 in task 223. Touches the Spool Cloud for teams map (#3) and the team switcher (#22).

## The question

How a spool project starts and how existing work comes in, and the Home view around both. Today Home is a cover grid with New project… and Open…; New project opens a modal with an optional name, a location (`~/spool` by default, Settings > Default project location) and two more choices (Add spool to a folder, Open a spool project), plus Import… for a `.spool` file.

Who it is for: Liam's own agents start projects with `spool init`, which stays as it is. The UI path is mainly for designers who use spool's built-in agent (the canvas's Agent tab, which runs Claude Code or Codex on the Mac).

## Decided (2026-10-22, task 223)

- **Who it is for (2026-10-23, Liam):** designers and other non-developers who just want to design, as well as developers. Lead with names, covers and plain words ("Design in this folder"); paths, branches and git are quiet detail. Nothing a designer needs may require typing a path or using a terminal.

- **No Drafts concept.** Everything outside a team is Your projects, in `~/spool` unless it was started in a folder. A cover shows its path only when it lives in a repo (`~/code/tvarso-web · main`).
- **The team switcher from #22 stays** as Home's way to sort: Your projects or a team.
- **New asks nothing up front.** No name, no location.
- **Reopened 2026-10-22: whether a project starts as an ask.** Round 1 made the chat box the way in, with Enter on an empty box as a hidden blank start. Liam: having to type into a chat to start a project feels weird. Round 2 draws every path, blank and ask, side by side.
- **The agent names the project from the first ask, before it writes a file**, so the folder is never renamed under a working agent. Rename later from the tab.
- **No agent ready** (Claude Code or Codex missing or signed out): the box still shows, and Enter opens the setup help that exists (`app/agent-start`).
- **An `untitled` project closed with no frames goes to the Trash by itself**, so New can't fill Your projects with empty covers.
- **New while a team is selected makes a team project at once**, showing the team's name on it.
- **One Open… door** replaces Open…, Add spool to a folder and Import…. It takes a folder, a path, a git link or a `.spool` file, picked, dropped on the window or pasted, reads what it finds and offers the one action that fits: open it, add `design/` beside the code, clone it, get the team project, import the file.
- Kept as is: ⌘N and ⌘O in the Mac app (the browser keeps ⌘N for itself, so there the button is the way); the default project location setting; `spool init`; Move to team from a cover's menu.
- **Start fresh.** The five takes from 2026-10-04 (`start-sheet`, `start-drafts`, `start-save`, `start-field`, `start-prompt`) are retired: they predate the switcher and the team Home. They are in git before `6523181e` if one is wanted again.

## Brief for round 1

Loom's explore stage, page `design/frames/explore/new-project/`, code in `design/shared/ui/explore/new-project/`. Two designers, two takes each, drawn on today's chrome (copy `app/spool-home`, `app/spool-home--switcher`, `app/spool-empty-project` as the starting point so each take reads as a diff), 1440x900, dark, real copy, playable.

Each take draws these states, across:

1. Home with no projects yet (today's "Start with an idea." welcome).
2. Home with projects, Your projects selected.
3. Starting: typing an ask, then the canvas as the agent begins drawing in the named project.
4. Starting blank: Enter with nothing typed.
5. The Open… door: empty, then reading a repo without `design/` (offers Add design/), a folder with `design/` (Open), a git link (Clone).
6. New while Tidemark is selected.

Round 1 (drawn): `first-ask`, `first-blank`, `talk-opener`, `talk-in-place`. Round 2 draws six paths for starting with and without the chat, Open… left as round 1 drew it.

Left to the designers in round 1, the main open question: **where "What are we making?" lives.** (a) At the top of Home, above the covers, making the project only on Enter. (b) New opens a blank canvas with the agent's box focused, so the frames appear where you are already looking. Draw both; the lean is (b).

Out of this round: moving a project between places (the existing Move to team flow), the phone, the browser at spool.page.

Related: #22, #3, #52

*From Linear DEV-165.* Plane: SPOOL-51

## Comments

### agent, 2026-10-22T20:18:04.561Z

Grilled with Liam in task 223. Decisions and the round 1 brief are in the body; designers start once Liam has read the brief.

### agent, 2026-10-22T20:58:19.450Z

Round 1 drawn (task 223): `first-ask`, `first-blank`, `talk-opener`, `talk-in-place` on `explore/new-project/`, every state frame boots clean. Waiting on Liam to delete, ask for more, or name a winner.

### agent, 2026-10-23T05:27:29.885Z

Round 2 drawn (task 223): six paths for starting with and without the chat, `start-offers`, `start-pane`, `start-split`, `start-choose`, `start-hint`, `start-home-line`, below round 1 on `explore/new-project/`. All frames boot clean. Gap found: nothing in `app/agent-start` covers a signed-out Claude Code; the takes drew a Sign in to Claude Code dialog (`claude auth login`, Check again).

### agent, 2026-10-23T06:11:06.998Z

Round 3 drawn (task 223): the Open… door four ways, `open-finder`, `open-found`, `open-field`, `open-drop`, below round 2, worded for designers as well as developers, with a shared spool.page link as a case. All frames boot clean.

### agent, 2026-11-02T20:40:51.427Z

Liam 2026-10-27 (task 223): **New project is `start-pane`**: New opens a blank canvas at once with the Agent pane open on the right, nothing to type in the middle. The Open… door is still open: `open-found` was recommended, then questioned (it needs spool to scan the Mac, and its list repeats Home).

### agent, 2026-11-02T21:27:16.010Z

`open-mac` drawn (task 223), the simpler Open… door: the Mac's own open panel; a folder with designs opens at once; a small sheet only when spool creates something (Design in this folder, Import, Clone); drop on Home and paste a link follow the same rule. Team projects not on this Mac stay on the team page. Waiting on Liam to play it.

### agent, 2026-11-03T06:19:36.913Z

Liam approved implementing `start-pane` and `open-mac` end to end and shipping a release (task 223). The build spec:


Decided by Liam 2026-10-27 after four design rounds. Prototypes on the team canvas (spool.page/devosurf/spool, page `explore/new-project/`): `start-pane` (New) and `open-mac` (Open…). Their code is in `design/shared/ui/explore/new-project/start-pane/` and `open-mac/` (read it for copy, layout and motion; never import it from `src/`).

Goal: clean, minimal, intuitive for designers (no paths or terminal needed) and developers alike. Replace the old flows; delete what they leave behind. No legacy paths kept "just in case", no compatibility shims for UI that no longer exists.

## A. New project (`start-pane`)

1. **New asks nothing.** Home's New project button (one plain button, no split menu), ⌘N, the desktop menu's New Project, and New on a team's Home all create the project at once and open its canvas. Local: next free `untitled`, `untitled-2` … in the `projects.location` setting (default `~/spool`). Team selected on Home: a Tidemark-style team project at `<projects.location>/<team address>/untitled…`, as `createTeamProjectAt` does today; its name row says the team.
2. **The canvas opens with the Agent pane already open on the right**, its composer ready but not focused. The middle keeps today's empty project screen ("Your canvas is ready.", the path, Copy project path, Use my agent), pointing designers at the pane, with using your own agent as the quieter path.
3. **The agent names the project from the first ask, before any file is written.** When the first message is sent in a project that is still `untitled*` with no frames, spool first gets a short kebab name (1-3 words, e.g. `tide-planner`) for it from the same engine in a quick one-shot, renames the project (the existing rename path, before the turn starts so nothing is mid-write), then starts the turn. The rail shows "Naming the project" while that runs. On failure or after ~10 s it stays `untitled` and the turn starts anyway. Never renames a project a person has named.
4. **No agent ready** (Claude Code or Codex missing or signed out): the existing preflight and setup help apply when the person tries to send. Signed out: a clear sign-in message with `claude auth login` and a Check again, reusing what `agent-preflight.ts` already knows.
5. **An abandoned untitled project goes to the Trash by itself.** Closing the tab of a project whose name is still `untitled*`, that has no frames and no running turn, moves it to the Trash after a short Undo toast (Undo reopens the tab and cancels the trash). It leaves Home and the closed-tab history.
6. Delete: the New project modal and its steps (name, location, "Add spool to a folder", "Open a spool project" choices), the split button's menu, the "Blank name becomes untitled" copy, and everything only they reached.

## B. Open… (`open-mac`)

1. **Home has two buttons: New project and Open… (⌘O).** The empty Home (no projects) shows the same two, as two cards. Import… is gone as its own control; a `.spool` file comes in through Open….
2. **Open… shows the system's own open panel** in the Mac app (folders and `.spool` files both selectable). In a plain browser, where there is no native panel, a slim in-app chooser built on the existing folder browser (`use-folder-browser.ts`) does the same job and nothing else. One chooser component serves every place that picks a folder (Open…, the Settings default location, the team moves that pick a place), native when available, in-app otherwise.
3. **Spool reads what it was given and takes the one fitting action.** One daemon read returns a finding; the UI acts on it:
   - a folder whose `design/` exists, or a path inside such a folder (walk up): **open it at once**, no sheet;
   - a code folder (git) without `design/`: sheet, "Design in this folder"; detail line says a design folder goes beside the code and the code is left as it is; then the empty canvas;
   - a plain folder: sheet, "Design in this folder";
   - a `.spool` file: sheet, "Import", into `projects.location`;
   - a git link (GitHub or any `https://…git` / `git@…`): sheet, "Clone", with progress, into `projects.location/<name>`, then read again (open, or Design in this folder);
   - a spool.page link to a team project: open it; if it isn't on this Mac, get it first (the existing Get it path) with progress;
   - nothing there (missing path, link that answers nothing): a plain sentence, the pasted text kept and editable, Try again.
   The sheet: the thing's icon and name, one plain sentence, quiet mono detail (path, branch), Cancel and one primary button. Words: "Design in this folder", "Open", "Import", "Clone". Never "Add spool to a folder".
4. **Drop anywhere on Home**: a folder or file dragged over the window shows it will take it and names what letting go does; on drop it follows the same rule. The Mac app exposes a dropped item's path (preload `webUtils.getPathForFile`). In a plain browser a dropped `.spool` file still imports by its bytes; a dropped folder says to use Open… instead.
5. **Paste on Home (⌘V outside a text field)**: a path, a git link or a spool.page link follows the same rule.
6. Team projects not on this Mac stay on the team's page in Home with Get it, as shipped. Open… doesn't list them.
7. Delete: `src/ui/picker.tsx` as it is (its four jobs), `project-location.tsx` (unused), dead `focusName`, the daemon's `/projects/start` route if nothing uses it, the old Import… entry points, and every test that only proved removed behaviour. Keep `initProjectAt`, `openProjectAt`, import and Get it as the actions the finding drives.

## Shared rules

- Chrome from `src/ui/primitives/` and roles in `src/ui/theme.css` only; `pnpm check` (design lint) must pass and its allowances may only shrink.
- Voice: plain sentences, no em-dashes, no hype, machine text in lowercase mono.
- Tests: each behaviour proved once at the cheapest level (a function before a daemon, a daemon before a browser). Update or delete the old picker tests (`home.test.ts` picker cases, `project-entry-browser.test.ts`, `picker-model.test.ts`) to match.
- One changeset, `minor`, plain prose for the changelog (see `docs/releases.md`).
- Commits atomic, `area: what changed`, lowercase, no body.

### agent, 2026-11-03T08:57:23.992Z

Shipped in spool.page 0.49.0 (merge 0c288e61, release PR #417, npm + Mac dmg). New asks nothing and opens with the Agent pane; the first ask names the project; an abandoned untitled goes to the Trash with Undo. Home has New project and Open…; Open… reads what it gets and opens, or asks once (Design in this folder, Import, Clone); drop and paste follow the same rule. The old picker, split button, Import… button, /projects/create and /fs/create are gone. design/frames/app redrawn, explore/new-project deleted.

Left out: team projects aren't named from the first ask, since spool has no rename for a team project outside a move. Broken-frame UX and whole-canvas check moved to task 390.
