# #52 · Idea: recent changes as a way into a project

- State: open
- Created: 2026-10-18T17:43:55.790Z
- Updated: 2026-10-18T17:43:55.790Z

Came out of Prototype the team canvas on a phone (#47) on 2026-10-04. It reaches past the Spool Cloud for teams map (#3), because it's as useful solo and on the desktop as it is to a team.

The idea (Liam's): open a project at what changed last. The phone take drew it as a `recent` list at the top of the page navigator, with the three latest frames, who saved each and when, plus a toast (`jonas saved cart · show`) that flies to the frame. Run against real projects (spool's own 983 frames on 122 pages, chamfer's 614), it was the fastest way in. In a big project the question is usually "what changed", not "where is it". Liam: "the recent will be a game changer", since even solo it shows what the latest frame was.

Open when this is picked up:

- What counts as a change: a person's save, an agent's turn, or a new frame. Whether an agent's turn of twenty files is one entry.
- Where it lives on the desktop: Home's cover grid, the pages rail, or what opening a project lands on. Idea: rethink starting a project and the Home view (#51) redraws Home.
- How it relates to the unseen marks spool already keeps (`changed`, `new`), and to the cloud's history on team projects.

Prototype: spool `design/shared/ui/explore/cloud/canvas/reach.tsx` (`Navigator`), commits `706ea380` and `8218d183`.

Nothing is decided.

*From Linear DEV-166.*

Related: #53, #62, #51, #47, #3

Plane: SPOOL-52
