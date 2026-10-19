# #13 · Decide where a team's design lives and how changes travel

- State: closed
- Labels: wayfinder:grilling
- Parent: #3
- Blocked by: #5, #6, #7, #8, #12
- Created: 2026-10-18T17:43:55.416Z
- Updated: 2026-10-18T17:43:57.389Z
- Closed: 2026-10-18T17:43:57.389Z

## Question

When a team works on one canvas, where is the real copy of `design/`, and how does a change one member's agent writes reach everyone else's canvas? The candidates so far:

- pushed git branches, as in the [July spec](https://github.com/liamvinberg/spool-cloud/issues/5): collaboration is branches and pull requests, the cloud shows what was pushed
- a one-way live mirror of each member's uncommitted work, as in [live working-tree sync](https://github.com/liamvinberg/spool-cloud/issues/2)
- two-way sync of full copies on every machine, Dropbox-style
- the folder living in the cloud and mounted into each member's project (Liam, 2026-10-01): local agents keep writing ordinary files, the person just sees the project in Spool

Inside the same decision: whether `design/` stays tracked in the product's git repo and who commits it (the daemon already auto-commits), what a branch means on a team canvas, what working offline means, how fast a change must arrive to feel live, and what a teammate whose agent runs in the cloud sees. Agents never run on Spool's servers.

The central decision of the map. Most other tickets wait on it.

*From Linear DEV-112.*

Related: #57, #65

Plane: SPOOL-13

## Comments

### agent, 2026-10-18T17:43:57.383Z

**Liam, 2026-10-02:** ## Resolution (grilling with Liam, 2026-10-02)

**A team works on one live canvas, held by Spool Cloud, mirrored as real files on every member's machine.**

- Every member keeps a full, real `design/` on their own disk. The daemon sends each saved file through Spool Cloud, which orders changes and keeps history, to every other member's daemon, which writes the real file. Target: about one second from save to a teammate's canvas. Files travel whole; nothing is merged character by character.
- The mount is out (research #12: the watcher never hears other machines, silent lost edits, never invisible, cloud agents see only the clone). Git branches as transport and one-way mirrors are out: not one live canvas.
- On a **team project**, `design/` leaves git. Spool Cloud holds the team's copy and its history, and the daemon stops committing it. Why: a `git checkout` of an old branch would roll the whole team's canvas back, and every member's auto-commits would conflict on pull. Solo projects stay exactly as today. Leaving is never a trap: everyone holds the full folder and can commit it back.
- One canvas per team project, whatever git branch each member is on. `design/` never imports product code, so frames don't depend on the branch. Explorations live in pages.
- Every save reaches the team right away, with no private mode. Sooner means fewer blind same-file edits, and a private mode is just a branch again. Share links for outsiders keep their own rule.
- Everything in `design/` travels, including layout (`frame.json`, `canvas.json`) and binary assets. The camera, selection and compile cache stay personal. Offline work catches up on reconnect, and same-file collisions go to "Decide what happens when two writers change the same file."
- Spool's servers can read a team's source (like Figma, GitHub, Linear). End-to-end encryption counts as an enterprise extra. This reverses the beta's keep-source-local rule for team projects only. The law that frame code never runs on `spool.page` stands.

Costs accepted:

- Cloud-run agents don't get `design/` from the clone, so they must fetch it later.
- CI can't import from `design/`; copying into the product stays the default.
- Cloud history becomes required.
- Core ADR 0008, where the daemon commits the canvas, needs a team-project exception once this ships.

Liam's idea of a live plan beside a plan for what's on `main` was handed to "Decide what a team pays for". A walkthrough video was made for Liam: https://liams-macbook-pro.tail9e5223.ts.net/spool-notes/team-live-canvas/
