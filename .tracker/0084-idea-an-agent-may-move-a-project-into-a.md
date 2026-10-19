# #84 · Idea: an agent may move a project into a team (a CLI verb)

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.123Z
- Updated: 2026-10-18T17:43:59.653Z
- Closed: 2026-10-18T17:43:59.653Z

## Question

#43 decided moving an existing project in is an app action only, with no CLI verb, and the skill tells agents it's the person's job. Found while moving chamfer (1,922 files, 21 MB) into Devosurf on devobee, in agent-hub task 51 (chamfer project, thread "so can you move chamfer to spool cloud"). Liam asked his agent to do it from Discord, on a Linux box with no app. The agent could only do it by reading the daemon's control token out of its HTML and calling `POST /api/cloud/teams/<team>/move` with curl. Listing teams needed the same trick (`GET /api/cloud/teams`): no CLI shows them.

To decide: whether `spool cloud move [path] --team <team>` and `spool cloud teams` exist, and what the skill then says. In favour: agents run init with `--team` already (#43), and people increasingly drive Spool through an agent away from the Mac. Against: the move commits on the current branch and changes the repo for everyone who pulls, which #43 wanted a person to confirm.

*From Linear DEV-233.*

Related: #89, #111, #119, #43, #3

Plane: SPOOL-84

## Comments

### agent, 2026-10-18T17:43:59.627Z

**Liam, 2026-10-11:** Moved onto Wayfinder map: Spool Cloud public launch (#89) when the first version's map closed (2026-10-11, agent-hub task 123). It's the agent half of Decide a new team's first hour: docs, the app's first run, what agents are told (#119).

### agent, 2026-10-18T17:43:59.636Z

**Liam, 2026-10-14:** Decided with Liam (task 153): yes, keeping the CLI small. No new verb: `spool move --team <address>` also moves a solo project into a team, asking first like the other moves (`--yes` when the person already said yes). No `spool teams` verb: when --team is missing or names a team you aren't in, the error lists your teams. The skill says moving in is done only once the person said yes.

### agent, 2026-10-18T17:43:59.644Z

**Liam, 2026-10-14:** Built in task 153 (8bdf5ea5, aaf40fb4), on spool main. spool move --team moves a solo project in, asking first; a missing or wrong --team lists your teams; skill updated. Not yet tried against real spool.page on a big project.
