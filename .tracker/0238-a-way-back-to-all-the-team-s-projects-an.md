# #238 · A way back to all: the team's projects, and Shared with you for clients

- State: closed (shipped; deploy rides the next release)
- Labels: enhancement
- Parent: #227
- Tasks: task 500 (Prototype way back navigation)
- Created: 2026-11-07T17:21:34.412Z
- Updated: 2026-11-08T10:09:06.909Z
- Closed: 2026-11-08T10:09:06.909Z

Raised by Cata in task 481 (spool#230), with screenshots of spool.page's team home and a project's read-only canvas.

Once you're in a project on spool.page there is no way back to "all".

- **Members**: the rail's top (team mark and project name, `src/ui/viewer/viewer.tsx` `PagesRail` `Bar`) links nowhere. The team's projects live at `/<team>` (`src/ui/viewer/team-home.tsx`), and the only way there is typing the address.
- **Clients**: no page gathers what was shared with them. Each share is its own link; a link share even lives on its own host (`<id>.onspool.page`), a people share at `/shared/<id>`. A client signed in by email could get a "Shared with you" page listing every share they hold across teams (Drive's "Shared with me"). A link held without signing in is tied to nobody, so it can't be listed.

Prototype first (loom: live frames on the spool canvas, variations plus a recommendation), then build:
1. The member's way back from a project to the team's projects.
2. The client's "Shared with you" page: where it lives, what a row shows, how a client gets there (a share's rail, the email, signing in).
3. A shared canvas linking back to it for a signed-in client (spool#230 roots their canvas at what was shared, so the rail's top is the share's name today).

## Comments

### agent, 2026-11-07T19:01:29.247Z

Round 1 on the canvas at explore/way-back (task 500): back-home (recommended), back-crumb, back-switch, back-path, back-tree, back-zoom. Cata: Shared with you is Home itself, the same for everyone outside a team, with nothing to create. Waiting on Cata's pick before building.

### agent, 2026-11-07T23:10:47.332Z

Round 2 on the canvas (task 500), as the Mac app in a browser on the new inline canvas, with Devosurf's real logo and projects: back-team-crumb (recommended), back-sidebar, back-team-tab, back-one-sidebar, back-shelf, back-unfold. Waiting on Cata's pick.

### agent, 2026-11-08T02:02:43.721Z

Adopted on the canvas (task 500): `back-final` is in `app/` as To build. Changed or new: `spool-viewer` and its states plus new `spool-viewer--shared` (the path), `spool-home--browser`, `--browser-teams`, `--shared`, `--shared-client`, `--account`, and the team box on every `spool-home` state. `explore/way-back` is deleted. Building in task 500: the canvas path and browser Home with Shared with you are on the task branch; `/api/shared`, `/shared` and the no-team sign-in landing are on spool-cloud's branch; the instant cut between Home and canvas is in progress.

### agent, 2026-11-08T03:16:03.005Z

Shipped (task 500): merged to main in spool (5d566c54) and spool-cloud (bea67bf). The canvas path leads with the team or `shared` and ⌘↑ climbs; Home has Shared with you at /shared (grouped by who shared, a new dot per browser) and the team box with sliding sidebar motion, on the Mac too; one browser document swaps Home and canvas in place; GET /api/shared; no-team sign-in lands on /shared. Not deployed: wait for the spool release carrying `.changeset/way-back.md`, bump spool-cloud's spool.page pin to it, then deploy (cloud serves the one document only once the pinned build has app.html).
