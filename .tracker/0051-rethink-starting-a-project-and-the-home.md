# #51 · Rethink starting a project and the Home view

- State: open
- Created: 2026-10-18T17:43:55.776Z
- Updated: 2026-10-23T06:11:06.998Z

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
