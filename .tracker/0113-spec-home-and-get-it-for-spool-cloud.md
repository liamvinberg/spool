# #113 · Spec: Home and Get it for Spool Cloud

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.463Z
- Updated: 2026-10-21T18:31:11.467Z
- Closed: 2026-10-21T18:31:11.467Z

## Problem Statement

Once you're in a Spool Cloud team, Home in the Mac app still treats teams as a side trip. The team you're in hides behind a dropdown, and below 720 px that dropdown disappears entirely. The address bar never says where you are: a refresh keeps the team but drops its page, and every launch reopens on Recent. A team you only view isn't a place at all, because choosing it throws you into a browser tab. Your own projects are an entry in a menu rather than a place beside your teams. spool.page/<team> already has addresses for every place; the Mac app does not.

Getting a team project onto a Mac that already holds its `design/` is worse. Get it refuses any folder with a `design/` in it ("already has a design/ folder. Choose another place."), which is exactly the checkout a teammate who worked before the move has. The exception is when the checkout already carries the team's `spool.json`, and then the never-synced files go up blind: older copies of frames are set aside or come back from the dead. Get it only offers checkouts of projects spool already registered, so the checkout you cloned months ago is never offered. Someone outside the team who pulls the move commit just sees `design/` vanish, with nothing on Home saying where it went or who to ask.

## Solution

**Home is a sidebar of places.**
- Every team you're in is listed, in a fixed alphabetical order, with no dropdown. Below a rule come Your projects, then New team….
- The team you're in slides open to show Projects, People and Settings beneath it (Settings for admins only), and the page is titled with the team's name.
- A team you only view is a place like any other, marked with an eye. Its projects open live in your browser; choosing the team itself opens nothing.
- Your projects is one more place. It keeps Open… beside New project and says it lives on this Mac only.
- The place you're in is in the Mac app's address, the same paths as spool.page/<team>. A refresh keeps you there, and the next launch opens where you last were.
- Below 720 px the sidebar becomes a column of icons, and nothing hides.

**Get it uses the design/ that's already there.**
- Get it finds your clone in the usual code folders and remembers a folder you pick.
- Before anything happens, it says on each place what that place holds.
- A `design/` spool never synced is brought level with the team using the team's history:
  - files the team already has, or had, take the team's version;
  - files only here go up;
  - only a file that would overwrite a teammate's work is set aside.
- A branch from before the move waits for the move commit, showing you the command that brings it in.
- Another project's `design/` is refused, and the place says why.

**Someone outside the team** who pulls the move commit sees a cover saying `design/` moved to the team and who moved it. Opening it shows a sheet that tells them who to ask; their uncommitted frames go up once they're in.

## User Stories

The sidebar

1. As a member of several teams, I want every team listed in the sidebar at once, so that I can see every place I can go without opening a menu.
2. As a member of several teams, I want the teams in a fixed alphabetical order that never reshuffles, so that each team stays in the same spot and my hand learns where it is.
3. As a member, I want a rule under the teams and then Your projects, so that my own projects are clearly apart from the teams'.
4. As someone allowed to start a team, I want New team… at the end of the list, so that starting one is where teams are.
5. As a member, I want the team I'm in to show Projects, People and Settings beneath it, so that a team's pages sit with the team.
6. As an editor or viewer, I want no Settings under a team I don't run, so that I'm never offered a page I can't use.
7. As a member, I want the page titled with the team's name, so that I always know which team's projects I'm looking at.
8. As a member, I want the chosen team's pages to slide open beneath it while the next page fades up, so that moving between places feels like one motion and not a jump.
9. As someone who turns motion off, I want none of that motion, so that Home respects my system setting.
10. As someone signed out or in no team, I want Home exactly as it is today, so that a solo user never sees team furniture.
11. As a member, I want Recent and the one search to stay at the top of the sidebar, so that finding a project in any team still takes one field.

Your projects

12. As a member, I want Your projects as one more place, titled "Your projects", so that my Mac-only projects are a place like my teams.
13. As a member in Your projects, I want Open… beside New project, so that opening a folder is as easy to reach as starting one.
14. As a member in Your projects, I want a line saying "On this Mac only. Move one to a team from its menu.", so that I know these aren't shared and how to share one.

Addresses and memory

15. As a Mac app user, I want the place I'm in to be in the address (`/<team>`, `/<team>/people`, `/<team>/settings`, `/` for Your projects), so that a refresh keeps me where I was.
16. As a member, I want the Mac app's addresses to be the same paths as spool.page/<team>, so that a place reads the same on the web and on my Mac.
17. As a member, I want a refresh in a team's Settings › Billing to come back to Billing, so that reloading never drops me to a team's front page.
18. As a member, I want browser back and forward in the app to move between the places I visited, so that Home behaves like the pages around it.
19. As a member, I want the next launch to open where I last was, remembered on this Mac, so that I pick up where I stopped.
20. As a member following a link from spool.page, I want its team opened first, whatever I last had open, so that a handover still lands where it points.
21. As a team admin, I want no team to take an address the Mac app uses for its own pages, so that a team's address never collides with one of spool's paths.

Viewer teams

22. As a viewer of a team, I want it in the sidebar like any other team, marked with an eye, so that a team I watch is a place too.
23. As a viewer, I want choosing the team to show its Projects and People on my Mac and not open a browser tab, so that looking around doesn't throw me out of the app.
24. As a viewer, I want a line saying "You watch <team>. A project opens live in your browser, and nothing comes to this Mac.", so that I know why nothing downloads.
25. As a viewer, I want opening one of its projects to open the live view in my browser, so that I can still see the work.
26. As a viewer, I want no New project and no Settings in that team, so that I'm never offered what a viewer can't do.

New project where you are

27. As an editor in a team, I want New project to start a team project in that team, so that new work goes where I'm standing.
28. As a member in Your projects, I want New project to start a project on this Mac only, so that my private work stays private.
29. As a member in a team I view, or a lapsed team, I want New project absent or explained as it is today, so that I'm not offered what I can't do.

The narrow window

30. As someone with a narrow window, I want the sidebar to become a column of team icons below 720 px, so that every place is still one click away.
31. As someone with a narrow window, I want the chosen team's page icons under its icon, so that People and Settings don't vanish when the window shrinks.
32. As someone with a narrow window, I want each icon to say its name when I point at it, so that I know which team is which.
33. As someone with a narrow window, I want the search still reachable, so that nothing hides.

spool.page

34. As a member on spool.page/<team>, I want the same sidebar of places, minus Your projects and Recent, which live on a Mac, so that the web and the app are one Home.
35. As a viewer on spool.page, I want my viewer teams marked with the eye there too, so that I know which teams I only watch.

Finding the checkout

36. As an editor getting a team project, I want Get it to find my clone of its repo even if spool never opened it, so that I'm not picking folders by hand.
37. As an editor, I want spool to look only in the usual code folders in my home, so that it never sets off macOS's permission prompts for Desktop, Documents or Downloads.
38. As an editor, I want the right checkout listed first, so that Get it is usually one click.
39. As an editor, I want a folder I pick with "In a checkout…" remembered for the next Get it, so that I pick it once.
40. As an editor, I want each place in the sheet to say what spool found there on its own detail line, with one plain sentence under the list, so that I know what Get it will do before I press it.

A design/ already there

41. As an editor whose checkout already has a `design/` spool never synced, I want Get it to use it and not refuse, so that the checkout I work in is the one I get.
42. As that editor, I want the sheet to say what it found before anything happens (how many files are the same, older, changed here, or only here), so that nothing surprises me.
43. As that editor, I want files that match a version the team had, deletions included, to take the team's, so that frames the team deleted never come back.
44. As that editor, I want files the team never had to go up as they are, so that my new work reaches the team.
45. As that editor, I want a file I changed where the team has its own version set aside on the canvas with the usual set-aside notice, so that nothing of mine overwrites a teammate's work without a click.
46. As that editor, I want a `design/` identical to the team's taken with no question, so that the easy case stays easy.
47. As an editor whose checkout already holds the team's `spool.json` but a `design/` spool never synced, I want the same comparison, so that a tracked `spool.json` no longer pushes stale files up blind.
48. As an editor whose copy synced here before, I want Get it to carry on as today, so that nothing changes for copies already in step.
49. As an editor on a branch from before the move, I want the sheet to name the move commit and the branch it's on and show the command that brings it in, so that I know exactly what to run.
50. As that editor, I want Get it to wait and carry on by itself once the commit arrives, so that I don't have to come back to it; frames I made on the branch then go up.
51. As an editor whose checkout holds another project's `design/`, I want that place dimmed with its reason and Just on this Mac picked, so that Get it never mixes two projects.

Moved out from under you

52. As someone outside the team who pulled the move commit, I want the project's cover to say "design/ moved to <team>" and who moved it, so that I know it didn't just vanish.
53. As that person, I want who moved it to come from the commit's author in git, so that spool.page never tells a stranger who is in a team.
54. As that person, I want opening the cover to show a sheet saying who moved it in which commit and to ask them to invite me, so that I know the way in.
55. As that person, I want the sheet to list the frames I never committed that are still in `design/`, and say they go up once I'm in, so that I know my work isn't lost.
56. As that person, I want Remove from Home and OK, so that I can clear it off Home or leave it.
57. As a viewer of the team who pulled it, I want Open in browser, so that I can still see the project.
58. As someone signed out who pulled it, I want Sign in, after which spool brings it back if I'm in the team, so that signing in is the one step.
59. As someone with the canvas open when the pull lands, I want the same sheet over the canvas, so that I'm told at once.
60. As that person, once I'm invited and join, I want the copy to fill in by itself and my uncommitted frames to go up, so that joining is the last step.

## Implementation Decisions

Home (spool core; the shared screens reach spool.page through the published bundle)

- The team switcher dropdown is replaced by a **sidebar of places**, one component shared by the Mac app and spool.page/<team>.
  - The order is the teams as spool.page lists them (already by name, then address).
  - On a Mac, Your projects and New team… follow the teams below a rule; at spool.page only New team… does.
  - The recent-and-search block (Recent and the one search) stays above the places.
  - A team's pages (today's team nav) render indented under the chosen team.
  - The team's Projects page is titled with the team's name, with the count and sort as today.
- **Motion**, from the prototype:
  - pages open on grid rows 0fr→1fr over 200 ms on the house ease-out `cubic-bezier(0.22,0.61,0.36,1)`;
  - the page fades up 6 px as the place changes;
  - rows ease their colour over 140 ms;
  - all of it is off under reduced motion.

  It takes its timings from the theme's roles where they exist, and design-lint must pass.
- **Places are addresses in the Mac app.** Home's place (Recent, Your projects, a team and its page, a Settings tab, Account) becomes a route, read from and written to the URL with history entries, as the spool.page Home already does with its place-to-path mapping. That mapping moves to one module both hosts use.
  - The Mac app's paths: `/` Your projects, `/<team>`, `/<team>/people`, `/<team>/settings` and `/<team>/settings/billing`, `/account`, and Recent's address (see Open questions).
  - The project route `/p/<name>` stays. Today's rewrites of the path back to `/` learn the team paths.
  - The daemon serves the app for these paths (an SPA fallback below its API routes).
- **Reserved addresses (spool-cloud).** Every first path segment the daemon serves or the Mac app routes is reserved as a team address, beside today's list: at least `projects`, `cloud`, `fs`, `abs`, `session`, and Recent's segment. This keeps a team at `/<team>` from ever shadowing a daemon route. spool publishes the list of those segments, so a new daemon route can't collide silently (see Testing).
- **Memory.**
  - The last Home address is kept on this Mac: the renderer already keeps the team in local storage, and that grows to the whole address.
  - A launch with no other instruction opens it.
  - A handover from spool.page (today's handover parameter) still wins.
  - A remembered team you've since left falls back to Recent.
- **Viewer teams on the Mac.** A team where you're a viewer is selectable: it shows Projects and People, the eye mark and the "You watch…" line, with no New project and no Settings.
  - Its covers are the browser-side covers that spool.page draws, as links to the live view, opened in the system browser.
  - Selecting it no longer opens a tab.
- **New project where you are.** Recent and the search results start a project on this Mac. A team's page starts it in that team, as today.
- **Narrow.**
  - Below 720 px each place is its mark in a 64 px column. The chosen team's page icons sit under its mark, and each carries its name as a title.
  - Search becomes an icon that opens the field (see Open questions).
  - The switcher's `hidden` below 720 px goes.
- `design/frames/app/spool-home*` are redrawn to match, the switcher frame replaced by the sidebar, per AGENTS.md. spool-cloud's landing copy of the team switcher is synced by its own script, not hand-edited.

Get it (spool core daemon and sheet; one lookup in spool-cloud)

- **Finding checkouts.** When the sheet opens, the daemon looks for git checkouts up to 3 levels deep under `~/code`, `~/dev`, `~/Developer`, `~/Projects`, `~/src`, `~/repos` and `~/GitHub`.
  - It reads only each candidate's origin from `.git/config`, following a worktree's `.git` file to its config.
  - It never reads Desktop, Documents or Downloads.
  - It adds the matches to today's known checkouts and to folders remembered from "In a checkout…", which are kept in the daemon's state.
  - Matches are ranked: a checkout already linked to the project first, then one whose `design/` holds the most of the team's frames, then the most recently used.
  - Finding a checkout registers nothing: a project is still registered only by init, open or Get it.
- **A survey per place.** Each place in the sheet carries what the daemon found, said on its detail line:
  - empty;
  - your checkout, with a `design/` already in it;
  - on a branch from before the move;
  - already holds its own project;
  - identical to the team's.

  One sentence under the list says what Get it will do with the chosen place, with the counts.
- **Bringing a never-synced design/ level.** A `design/` counts as never synced when it has no sync record in `design/.spool`, whether `spool.json` is absent, untracked or tracked. Each file under it is classed against the team before the first connection:
  - **same**: matches the team's current file. Kept.
  - **older**: matches a version the team had at that path, including a path the team has since deleted. Takes the team's current state, so nothing goes up and a deleted frame never comes back.
  - **only here**: a path the team never had. Goes up as ordinary saves.
  - **changed here**: a path where the team has its own version that this one never matched. The team's version lands, and this one becomes a set-aside mark with today's notice (Use theirs, Use mine, Ask agent).

  `canvas.json` keeps its key-by-key merge. "Older" never overrides "an edit beats a delete" for files that are really changed here. Get it rolls back what it made if refused, as today.
- **spool-cloud: the history lookup.** The sync object answers, for a list of paths and content hashes, whether each hash is the team's current one at that path, one the team had there within history, or never seen. A delete counts as a version. It answers from the kept saves table over a bounded window. It is an authenticated editor read on the project, batched for big folders, and counts against no save limit.
- **Branch from before the move.**
  - A checkout counts as pre-move when its `design/` is tracked by git and the branch lacks the commit that moved it (the `design: moved to Spool Cloud` commit reachable from the remote's default branch).
  - The sheet names that commit and its branch and shows the command (`git merge origin/<branch>` or a pull), with Get it waiting.
  - The daemon watches the checkout and carries on once the commit arrives. Then today's path takes over, and frames made on the branch go up.
- **Another project's design/** (no frame paths in common with the team's) is dimmed with its reason and can't be chosen. Today's blanket refusal goes: it stays only for a folder that isn't empty and isn't a checkout, under Just on this Mac.

Moved away (spool core daemon and Home)

- A registered project whose `design/` left git through a move commit, and whose `spool.json` names a team this account can't edit, gets a new cover state, **moved**. The daemon reads the move commit's hash, author name and date from git, along with the frames still in `design/` that git never tracked.
  - The cover says `design/ moved to <team address>`, with "moved by <author>".
  - The sheet comes in three standings: outside (OK), viewer (Open in browser) and signed out (Sign in). Each also has Remove from Home, which is today's Hide from Spool.
  - The same sheet stands over an open canvas of that project when the pull lands.
- Standing is read from spool.page's answer for the project (not a member, viewer, signed out), never from anything that reveals members. When the account becomes an editor, the copy is fetched and the leftover frames go up through today's own-work path after a move.

Glossary

- spool's glossary gains **Move commit** ("the one commit that takes `design/` out of git and puts `spool.json` in, `design: moved to Spool Cloud`") and **Survey** (what Get it found at a place). Home's "place" is not added as a term because the glossary's Place is a page object's position; the spec says "a place in Home's sidebar".

## Testing Decisions

- A good test drives the system from outside and asserts what a person or another system sees: a click on Home and the address and page that follow, a Get it request to the daemon and the files on disk and the saves that reach the team, a request to the sync object and its answer. Never which private function ran.
- **Home:**
  - the team screens' browser tests over the fake team source (prior art: the teams browser tests and Home's own tests);
  - places in order;
  - a team's pages under it, admin vs editor vs viewer;
  - the address after each move, and a reload landing on the same place;
  - back and forward;
  - the remembered place on a fresh mount, and a handover winning over it;
  - the viewer line and browser links, with no tab opened on selecting;
  - New project's destination per place;
  - the narrow column at 719 px with nothing hidden;
  - reduced motion with no transitions.
- **Reserved addresses:** spool exports the daemon's and the Mac app's first path segments from the published package, with a test that the daemon serves no other; spool-cloud's address tests import that list and assert every segment is reserved, so the pin bump that adds a route fails until it is.
- **Get it (daemon):** the team-moves harness's Get it suite, with a fake team over the real sync object where it already runs. Cases:
  - a scan over a fake home (code folders found, Desktop never read, worktrees followed);
  - remembered picks;
  - each survey;
  - same / older / only here / changed here from one folder, with a team-deleted frame never resurrected;
  - a tracked `spool.json` case;
  - a pre-move branch that waits and carries on when the commit is merged in;
  - another project dimmed;
  - identical taken.
- **The history lookup (spool-cloud):** the sync worker tests in the Workers vitest pool, as for catch-up and moves: current, had, deleted, never seen; batched; viewer refused.
- **Moved away:** daemon tests over a real temporary git repo with a move commit by another author, the cover's state and the sheet's facts per standing; then joining fills the copy and sends the leftover frames (prior art: the pulled-move own-work tests).

## Out of Scope

- History, restore, Compare, `spool history` and history retention: Spec: team history, restore and backups (#114). This spec only reads the saves the sync object already keeps.
- Moving between teams, out of a team and into a checkout: shipped from #135.
- The setup list, billing banners and lapsed notices on Home: shipped from #122.
- Sharing a whole project (#115); a project leaving a team and deleting an account (#116).
- Home on a phone, and the navigator (#79).
- Cloning a repo for the person: spool still only shows the clone command.

## Further Notes

Audit of what already ships (spool `src/`, spool-cloud `src/worker/`):

- **Sidebar of places: partial.**
  - Shipped:
    - teams ordered by name in spool-cloud's team list;
    - team nav with Settings for admins only (`ui/teams.tsx` TeamNav);
    - Recent and one search in the sidebar (`ui/home-find.tsx`);
    - account inside Home;
    - the setup list.
  - Missing:
    - it is a dropdown, `TeamSwitcher` in `ui/teams.tsx`;
    - no rule or Your projects place;
    - the team page is titled "Projects";
    - no motion.
- **Addresses: shipped at spool.page, missing in the Mac app.**
  - spool.page: `ui/viewer/team-home.tsx` maps place to path with pushState.
  - The Mac app routes only `/` and `/p/<name>` (`ui/app.tsx`).
  - Reserved addresses (`teams/addresses.ts`) lack the daemon's segments.
- **Memory: partial.**
  - The team is kept in local storage (`ui/teams.tsx`, `remembered.ts`, changelog d5747e7), but its page isn't, and Home reopens on Recent.
  - The handover opens its team first (`ui/handover.ts`).
- **Viewer team on the Mac: missing.** It is a menu link opening a browser tab ("viewer ↗"). spool.page already treats it as a place, with no eye and no line.
- **New project where you are: shipped** for team pages and Your projects (`ui/app.tsx` pickingTeam).
- **Your projects as a place: partial.** It is titled "Projects", Open… sits in New project's menu, and the line is missing.
- **Narrow column: missing.** Below 720 px the switcher and the search hide (`ui/teams.tsx`, `ui/home-find.tsx`).
- **Get it finds clones: missing.**
  - Only registered checkouts are found (`daemon/team-projects.ts` knownCheckouts).
  - "In a checkout…" isn't remembered (`ui/team-moves.tsx`).
- **design/ already there: missing.**
  - `get-it.ts` refuses any `design/`.
  - A tracked `spool.json` lets old files up, with an edit beating a team delete (`sync/object.ts`).
  - Set-aside marks and their notice ship (`daemon/set-aside*.ts`), and every save is kept in the sync object's saves table with no pruning.
  - There is no lookup by hash.
- **Pre-move branch: partial.**
  - The branch copy stays followed and the git guard ships (changelog 2c4bb66).
  - The mover's branch warning ships (#87, `history.ts` branchesTouchingDesign).
  - Get it doesn't name the move commit, show the command, or wait.
- **Moved away for outsiders: missing.**
  - Only the CLI's error sentences exist (`open.ts`, `get-it.ts`).
  - No cover state, sheet or commit author is read.
- **Identical / synced before: partial.** A copy that synced before carries on (`get-it.ts` resume). An unlinked identical folder is refused.

## Open questions

1. **Recent and "opens where you last were".** Recent and the one search shipped after #97 and are Home's default today. Recommendation:
   - Recent becomes a place with its own address, `/recent`, reserved;
   - the next launch opens the last place, Recent included;
   - a first launch, with nothing remembered, opens Recent.
2. **The search below 720 px.** "Nothing hides" was drawn before the search existed. Recommendation: a search icon at the top of the column that opens the field over the page.
3. **How far back "older" reaches.** #96 says 90 days of history, but history isn't pruned today and its retention is #114's. Recommendation: class against every save the sync object still keeps, so the window follows #114's retention when it lands. A file matching only a version older than that counts as changed here, which is the safe side because it is set aside.
4. **Existing teams on newly reserved addresses.** Reserving `projects`, `cloud`, `fs`, `abs`, `session` and `recent` could hit a team that already holds one. Recommendation: before release, the maintainer checks production's teams for those addresses and renames any one found, keeping the old address redirecting, as a rename already does.
5. **Viewer teams' project covers on the Mac.** Should a viewer team on a Mac show the projects' covers (needing the browser-side cover fetch inside the app), or a plain list? Recommendation: the same covers spool.page shows, since the Home is meant to be one.

Related: #122, #97, #96, #89

Plane: SPOOL-113

## Comments

### agent, 2026-10-21T16:51:56.708Z

Spec and build tickets written (agent-hub task 205). The body above is the spec, with the audit of what already ships in Further Notes and five open questions at its end. Build tickets: #192 Home: a sidebar of places at their own addresses; #195 Home: viewer teams are places on the Mac, and the narrow column (blocked by #192); #193 Get it: finds your checkout and says what each place holds; #196 Get it: brings a never-synced design/ level with the team (blocked by #193); #194 Get it: someone outside the team sees where design/ moved.

### agent, 2026-10-21T18:31:11.467Z

All children (#192–#196) closed: spool 186487fe, spool-cloud e28440f. Reaches users with a spool.page release, the spool-cloud pin bump and deploy (seen lookup before spool's release), and the app frame redraws.
