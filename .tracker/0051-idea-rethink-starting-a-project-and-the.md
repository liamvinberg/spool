# #51 · Idea: rethink starting a project and the Home view

- State: open
- Created: 2026-10-18T17:43:55.776Z
- Updated: 2026-10-18T17:43:55.776Z

Opened 2026-10-05 and parked: it redraws Home's whole layout, so it waits until there's room to work through it. It touches the Spool Cloud for teams map (#3), since starting a project while a team is selected makes a team project.

The idea (Liam): rethink how a spool project starts and how existing work comes in, along with the Home view around both. Today Home is a cover grid with Open… and New project…, and New project opens a modal with a name, a location and two more choices (Add spool to a folder, Open a spool project). There are two cases: a repo someone already made with a `design/` in it, which you want to register and go into, and a new project that isn't really in a repo, like a draft. A new `design/` inside a repo is the same thing as a new project. [pen.dev](http://pen.dev)'s model is for comparison: the plus opens an unsaved document, and ⌘S asks where to save it.

The model the prototypes share: a project lives in one of three places, Drafts (`~/spool/<name>`, outside any repo), a folder (`design/` beside the code), or a team (spool places the files at `~/spool/<team>/<name>`). Bringing existing work in is one Open… door that reads the folder or git link and offers one action. The takes differ only on when the place is chosen.

Five takes are drawn in spool under `design/frames/explore/new-project/`, over `design/shared/lib/explore/new-project/places.ts`, smallest change first:

- `start-sheet`: one sheet asks for the name and Drafts / Folder… / Tidemark up front.
- `start-drafts`: Figma's drafts. ⌘N makes `untitled` at once, and a place chip in the bar moves it into a folder or a team later.
- `start-save`: [pen.dev](http://pen.dev)'s unsaved document. ⌘S drops a save sheet from the tab.
- `start-field`: one field reads a name, a path or a git link. ⌘K brings it up over any canvas.
- `start-prompt`: a project starts as an ask to the agent, which names it.

Leaning, not decided: `start-drafts` with `start-field`'s ⌘K palette, because agents write files from the first second and asking where up front slows the start.

Open when this is picked up:

- `start-drafts` lists teams as sidebar items. That conflicts with the team switcher decided in #22.
- Moving a folder project into a team takes `design/` out of git and needs a confirm step.
- Moving or renaming a project while an agent is mid-turn needs a link left at the old path.
- Chrome keeps ⌘N for itself.
- A dropped folder can't be read until release, and a browser drop gives no path.

*From Linear DEV-165.*

Related: #52, #22, #3

Plane: SPOOL-51
