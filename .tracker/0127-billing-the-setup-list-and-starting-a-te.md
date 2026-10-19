# #127 · Billing: the setup list and starting a team from spool.page

- State: closed
- Labels: ready-for-agent
- Parent: #122
- Blocked by: #123
- Created: 2026-10-18T17:43:56.622Z
- Updated: 2026-10-18T17:44:01.103Z
- Closed: 2026-10-18T17:44:01.103Z

## Parent

Spec: paying for a team: trial, seats and billing (#122)

## What to build

The way in. [spool.page/start](http://spool.page/start) takes a team's name and the cycle the landing showed; a signed-out visitor goes through sign-in titled "Sign in to start ", and signing in creates the team, starts the trial and lands on [spool.page/](http://spool.page/). There, and on the app's Home for the same team, one setup list: Name the team, Invite people (email rows marked editor or viewer, Send invites or Skip), Get spool on your Mac (Download for Mac or Open in spool, "Sign in there as

and spool carries on with step 4"), Move a project in (your own projects, each with today's Move to …). An account whose trial is used gets "Pay for " as step 2, before invites. Steps are read from facts (invites sent, a Mac signed in by a member of this team, a team project exists); only Skip and done are stored. A done step keeps its title and says what came of it; when the last is done the list is gone for good and a toast says " is set up". New team in the app starts the same trial and list. Spans spool-cloud (start route, setup record, the facts) and spool (the list on both hosts).

## Acceptance criteria

- [ ] [spool.page/start](http://spool.page/start) signed out goes through sign-in and back, then creates the team with a trial and lands on its page
- [ ] The list shows on [spool.page/](http://spool.page/) and in the app, the same component, at the same step
- [ ] Each step completes from its fact; Skip completes Invite people
- [ ] A used trial puts "Pay for " second, and it completes when the team pays
- [ ] Finishing the last step removes the list for good and shows the toast once
- [ ] Only admins see the list

## Blocked by

- Billing: a team on a trial pays through Stripe

*From Linear DEV-278.*

Plane: SPOOL-127

## Comments

### agent, 2026-10-18T17:44:01.085Z

**Liam, 2026-10-11:** Landed on the build branches (not main yet; the ticket closes when it merges).

**spool-cloud** `124-implement-spec-https-linear-app-devosurf`:
- 5b56f76 teams: start is a reserved address and runs the worker first
- 1c2e172 auth: sign-in returns to a page with its query and names the team it starts
- 43e21b2 teams: the setup list read from facts, with skip and done
- 0ebff1f teams: spool.page/start creates the team and lands on its page

**spool** `124-implement-spec-https-linear-app-devosurf`:
- 14d5466a teams: setup list facts, skip invites and done through spool.page, the daemon and the team source
- b3b0eedd ui: hand a team alone over from spool.page to home on this mac
- e975e996 ui: a new team's setup list on home for admins in the app and at spool.page/

Reads where the spec was silent: spool.page/start reached from another site (a Google sign-in included) asks for one Start click first, so no other site can spend someone's trial; coming back to /start within a day lands on the team it made instead of making a second; teams that existed before (Devosurf too) are marked set up and never see the list; "carries on with step 4" reads step 5 when Pay for  is step 2.

### agent, 2026-10-18T17:44:01.095Z

**Liam, 2026-10-12:** Merged to main in both repos and released: spool.page 0.38.0 on npm, spool.page (cloud) deployed to production billing in Stripe test mode until #128. Closing.
