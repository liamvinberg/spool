# #195 · Home: viewer teams are places on the Mac, and the narrow column

- State: closed
- Labels: ready-for-agent
- Parent: #113
- Blocked by: #192
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:51:52.267Z
- Updated: 2026-10-21T18:31:11.426Z
- Closed: 2026-10-21T18:31:11.426Z

## Parent

Spec: Home and Get it for Spool Cloud (#113)

## What to build

Two pieces of the #97 Home that the sidebar ticket leaves out.

**Viewer teams are places on the Mac.** A team you only view sits in the sidebar like any other team, marked with an eye (on spool.page too).
- Choosing it no longer opens a browser tab. It shows Projects and People with the line "You watch <team>. A project opens live in your browser, and nothing comes to this Mac." There is no New project and no Settings.
- Its projects show as the same covers spool.page draws (#113 open question 5). Opening one opens its live view in the system browser.
- Its address is `/<team>` like any team's.

**The narrow column.**
- Below 720 px the sidebar becomes a 64 px column of place marks: teams, Your projects and New team….
- The chosen team's page icons sit under its mark, and every icon carries its name as a title.
- The search becomes an icon that opens the field over the page (#113 open question 2).
- Nothing hides.

Redraw the matching `design/frames/app/spool-home*` frames (a viewer place; narrow).

Spans **spool** only (the screens reach spool.page through the published bundle; spool-cloud bumps its pin as usual).

## Acceptance criteria

- [ ] A viewer team in the Mac app is selectable, carries the eye, and shows Projects, People and the "You watch" line, without New project or Settings.
- [ ] Selecting a viewer team opens no browser tab. Opening one of its projects opens its live view in the system browser.
- [ ] The eye also marks viewer teams on spool.page/<team>.
- [ ] At 719 px every place is a mark, the chosen team's pages are icons under it, every icon has its name as a title, and the search is reachable.
- [ ] The frames are redrawn; `pnpm check` passes; a changeset.

## Blocked by

- Home: a sidebar of places at their own addresses (spool#192)

## Comments

### agent, 2026-10-21T18:11:07.857Z

Taken the spec's recommendations: open question 2, below 720 px the search is an icon at the top of the column that opens the field over the page (Escape closes it); open question 5, a viewer team on the Mac shows the same covers spool.page draws, read through a new daemon route `GET /api/cloud/teams/:team/projects/:project/cover` that carries the Mac's device session to spool.page's cover, each opening the project's live view in the system browser. spool.page's cover route must accept the device session's Bearer token for this to show stills on a Mac; until then the covers fall back to the project's letter.

### agent, 2026-10-21T18:31:11.426Z

Merged to spool main in 186487fe; spool-cloud spool-cloud main e28440f (fc5edfd) proves a viewer's Mac gets covers with its own sign-in. Took the recommendations: search icon below 720 px, viewer teams show spool.page's covers. Left: viewer and narrow app frames to redraw.
