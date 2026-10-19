# #97 · Prototype Home once you're in Spool Cloud

- State: closed
- Labels: wayfinder:prototype
- Parent: #89
- Created: 2026-10-18T17:43:56.281Z
- Updated: 2026-10-18T17:44:00.107Z
- Closed: 2026-10-18T17:44:00.107Z

## Question

Home forgets which team you were in on refresh, team scopes have no address, viewer teams open a browser tab, and the switcher hides under 720 px. How does Home work when your team is where you live: what it opens on, what it remembers, where new projects go, how personal projects sit beside teams?

*From Linear DEV-248.*

Related: #98, #113

Plane: SPOOL-97

## Comments

### agent, 2026-10-18T17:44:00.097Z

**Liam, 2026-10-10:** ## Resolution

Prototype: the `explore/cloud/home` page of the spool canvas at https://spool.page/devosurf/spool. The frames are `home-sidebar`, `--yours`, `--viewer` and `--narrow`, with the code in `design/shared/ui/explore/cloud-home/`. Three takes were drawn: switcher, sidebar and together. Cata picked the sidebar, and the other two were deleted.

**Home is a sidebar of places.**
- Every team you're in is listed in the sidebar, in a fixed alphabetical order that doesn't reshuffle as you move. Below a rule come Your projects, then New team…. There is no dropdown.
- The team you're in opens to show Projects, People and Settings (Settings for admins only) beneath it. The main column is titled with the team's name.
- Motion is part of the design: the chosen team's pages slide open beneath it (rows 0fr to 1fr, 200 ms, the house ease-out `cubic-bezier(0.22,0.61,0.36,1)`), the main column fades up 6 px as the page changes, and rows ease their colour over 140 ms. All of it is off under reduced motion.
- Below 720 px the sidebar becomes a column of team icons, with the chosen team's page icons under its icon. Nothing hides.

**Addresses and memory.**
- The place you're in is in the address: `/<team>`, `/<team>/people`, `/<team>/settings`. Your projects is `/`. These are the same paths as `spool.page/<team>`, so a refresh keeps you where you were. The app's own routes (`/p/<name>`) need their first segments reserved as team addresses.
- The next launch opens where you last were, remembered on this Mac. A link handed over from spool.page still opens its team first.

**Viewer teams.**
- A team you only view is a place like any other, marked with an eye. It has Projects and People, no Settings and no New project. A line says "You watch . A project opens live in your browser, and nothing comes to this Mac."
- Opening one of its projects opens the live view in the browser. Choosing the team itself no longer opens a browser tab.

**New project and personal projects.**
- New project starts in the place you're in: a team project in that team, or a project on this Mac only in Your projects.
- Your projects is one more place in the list. It keeps Open… beside New project and says "On this Mac only. Move one to a team from its menu."
