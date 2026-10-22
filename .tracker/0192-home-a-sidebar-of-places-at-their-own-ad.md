# #192 · Home: a sidebar of places at their own addresses

- State: closed
- Labels: ready-for-agent
- Parent: #113
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:51:52.199Z
- Updated: 2026-10-21T18:31:11.309Z
- Closed: 2026-10-21T18:31:11.309Z

## Parent

Spec: Home and Get it for Spool Cloud (#113)

## What to build

Home's team switcher dropdown becomes a **sidebar of places**, and every place gets its own address in the Mac app. The sidebar is one component, shared by the Mac app and spool.page/<team>.

The sidebar:
- Every team you're in, in a fixed alphabetical order (the order spool.page already lists them in).
- On a Mac, a rule, then **Your projects**; then New team….
- The team you're in slides open to show Projects, People and Settings (admins only) beneath it.
- The page is titled with the team's name.
- Recent and the one search stay at the top.

Your projects:
- It is titled "Your projects".
- It has Open… beside New project.
- It says "On this Mac only. Move one to a team from its menu."

Motion, from the #97 prototype:
- the chosen team's pages open on grid rows 0fr→1fr over 200 ms on the house ease-out;
- the page fades up 6 px as the place changes;
- rows ease their colour over 140 ms;
- all of it is off under reduced motion.

Addresses in the Mac app:
- The place is the address: `/` Your projects, `/<team>`, `/<team>/people`, `/<team>/settings`, `/<team>/settings/billing`, `/account`, and Recent's address (#113 open question 1: recommended `/recent`). These use the same place-to-path mapping spool.page's Home uses, moved to one module both hosts share.
- The daemon serves the app for these paths beneath its API routes.
- History entries make back and forward work.
- The last address is kept on this Mac and opened at launch. A handover from spool.page still wins, and a remembered team you've left falls back to Recent.
- New project from Recent or the search starts a project on this Mac; from a team's page, in that team (as today).

Reserved addresses (spool-cloud):
- spool exports the daemon's and the Mac app's first path segments from the published package.
- spool-cloud reserves every one of them as a team address: at least `projects`, `cloud`, `fs`, `abs`, `session` and Recent's segment.
- spool-cloud's address tests read the exported list.

Redraw `design/frames/app/spool-home*` to match (the switcher frame becomes the sidebar).

Spans **spool** (the sidebar, routes, memory, the daemon's fallback, the exported segments, the app frames) and **spool-cloud** (the reserved addresses, and the pin bump that brings the new Home to spool.page/<team>).

## Acceptance criteria

- [ ] There is no dropdown. Every team is listed in name order, with Your projects below a rule on a Mac only, and New team… last.
- [ ] Only the chosen team shows its pages. Settings shows for admins only. The team page's title is the team's name.
- [ ] The motion runs as specified, and none of it runs under reduced motion.
- [ ] Your projects is titled so, has Open… beside New project, and has the "On this Mac only" line.
- [ ] Each place in the Mac app has its address. A reload lands on the same place, Settings › Billing included. Back and forward move between places.
- [ ] A fresh launch opens the last place. A handover opens its team. A left team falls back to Recent.
- [ ] New project from Recent or the search makes a project on this Mac; from a team page, a team project there.
- [ ] spool.page/<team> shows the same sidebar, without Your projects and Recent.
- [ ] spool-cloud refuses every exported segment as a team address, and its test reads the list from the published package.
- [ ] The app frames are redrawn; `pnpm check` (design-lint) passes.
- [ ] A changeset in spool.

## Blocked by

None (can start immediately).

Related: #97

## Comments

### agent, 2026-10-21T18:03:08.930Z

Taken the spec's recommendation on open question 1: Recent is a place at `/recent`, the next launch opens the last place (Recent included), and a first launch with nothing remembered opens Recent. `/account` stays spool.page's: the Mac's Account still opens spool.page/account in the browser, and an `/account` address on the Mac falls back like a left team. The segments ship as `APP_PATH_SEGMENTS` from `spool.page/sync-protocol` (src/app-paths.ts), tested against the daemon's Hono routes in src/app-paths.test.ts.

### agent, 2026-10-21T18:31:11.309Z

Merged to spool main in 186487fe; reserved addresses in spool-cloud main e28440f (7de1c4f; its test reads APP_PATH_SEGMENTS from spool.page/sync-protocol once the pin reaches the release, a stand-in list until then). Production D1 has no team on a newly reserved address. Took the spec's recommendation: Recent at /recent, the next launch reopens the last place. Left: design/frames/app/spool-home* redraw (canvas is read-only for agents); pages open on the 180 ms theme role (no 200 ms role exists); /account on the Mac still opens spool.page/account.
