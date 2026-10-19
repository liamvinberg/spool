# #22 · Prototype the team's home in Spool Cloud

- State: closed
- Labels: wayfinder:prototype
- Parent: #3
- Blocked by: #13
- Created: 2026-10-18T17:43:55.494Z
- Updated: 2026-10-18T17:43:57.678Z
- Closed: 2026-10-18T17:43:57.678Z

## Question

What does Spool Cloud look like to a team member in the browser and in the app? The team's projects, inviting people, and getting from there into the canvas. Drawn as spool frames under `design/frames/explore/cloud/`, variations as separate frames.

Amended 2026-10-02 after Decide where a team's design lives and how changes travel (#13): a team project is one live canvas whatever branch anyone is on, so there is no branch or live-state picker to draw. Joining from an invite on a laptop stays fog on the map; draw invites loosely.

*From Linear DEV-121.*

Links:
- [Team home takes (screenshots)](https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/team-home/)

Related: #44, #51, #62, #64, #19

Plane: SPOOL-22

## Comments

### agent, 2026-10-18T17:43:57.672Z

**Liam, 2026-10-04:** ## Resolution (prototype with Liam, 2026-10-04)

**A team has a home, picked with a switcher. That home shows its projects as covers, and a team project's link opens spool.**

- **Switcher.** A switcher at the top of Home's sidebar picks one team at a time. "Your projects" (the ones only on this Mac) is one more entry in its menu, and "New team…" sits under them. Under the team: Projects and People. People will be in more than one team (an agency's own team plus a client's), so a switcher scales where a sidebar section per team does not.
- **Covers.** A team's Home is the Home that ships: the project grid. A cover shows who is inside right now ("2 here", "sam is here"). A team project not yet on this Mac is dimmed with "Get it", which stays fog until joining is decided. Invite opens a sheet with the email field and the team's people and where they are.
- **Link opens spool.** spool.page/tidemark/tidemark-app knocks on spool on this Mac, the way local.spool.page does, and hands over. Anyone without spool, or on a phone, gets "Look in the browser" (the read-only canvas). The team's page also exists in the browser at spool.page/tidemark, as the switcher's Home minus what only lives on your Mac.

Rejected: a sidebar section per team (grows with every team), a live "now" Home (who's on which frame, what agents do; could layer on later), no team page at all (teams are what pays, so a team needs a visible home), Home as a canvas.

Frames: spool `design/frames/explore/cloud/home/` (`sidebar/sidebar-switcher` and its `--menu` and `--invite` states, `page/page-covers`, `link/link-opens-spool`), commit `ec1736a4`; the earlier five-take round is `29b7a8b5`. Screenshots: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/team-home/
