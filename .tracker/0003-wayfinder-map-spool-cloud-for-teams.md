# #3 · Wayfinder map: Spool Cloud for teams

- State: closed
- Labels: wayfinder:map
- Created: 2026-10-18T17:43:55.327Z
- Updated: 2026-10-18T17:43:57.145Z
- Closed: 2026-10-18T17:43:57.145Z

## Destination

A build-ready spec for the first paid version of Spool Cloud: how a small product team works on one canvas together. The team is two to eight people, each running Spool and their own agent on their own machine, plus clients and stakeholders who only open links in a browser. The spec settles where the team's design lives and how changes travel between machines, how people and agents see each other, what the cloud builds and serves, accounts, teams and invites, and where free ends and paid begins, with the screens prototyped in spool. It may end as more than one spec if the first version splits cleanly.

This lays the foundation of Spool Cloud. Anything beyond the first paid version is filed as a backlog idea in the Spool project, not a ticket here.

## Notes

- Start from what exists; don't re-derive it.
- [spool cloud v1 spec](https://github.com/liamvinberg/spool-cloud/issues/5) (2026-07-23): the cloud renders pushed git branches through a GitHub App, PR previews, per-seat pricing where the second member pays. Its licence section is reversed (MIT since 2026-07-27) and the sharing beta replaced its sign-in. The rest is evidence, not rules.
- [live working-tree sync](https://github.com/liamvinberg/spool-cloud/issues/2) (2026-07-26, never decided): one-way upload of uncommitted work, with the alternatives it rejected and the write tiers.
- The sharing beta: [map](https://github.com/liamvinberg/spool-cloud/issues/155), [spec](https://github.com/liamvinberg/spool-cloud/issues/164), built and waiting on [the human release checks](https://github.com/liamvinberg/spool-cloud/issues/177). Its [publication](https://github.com/liamvinberg/spool-cloud/issues/160) and [identity and hosting](https://github.com/liamvinberg/spool-cloud/issues/161) decisions are the floor this map builds on, and this map may change them.
- The 2026-09-30 share rework: instant copy-link shipped; links that update themselves when the agent's turn ends were picked and are unbuilt. Frames in `design/frames/explore/share/`.
- [read-only canvas sharing](https://github.com/liamvinberg/spool-cloud/issues/163) is carried by this map's read-only canvas prototype.
- Laws carried from the July spec until a ticket here overturns one: frame code never runs on `spool.page`; Spool never runs agents on its servers and never sells AI; people bring their own agent.
- Vocabulary: the core glossary (`CONTEXT.md` in spool) and the cloud glossary (`CONTEXT.md` in spool-cloud). New words, such as what a team's shared canvas is called or what "mounted" means, get sharpened there as they settle.
- Research lands in `spool-cloud/research/` as numbered folders on main, per its README. Prototypes are spool frames under `design/frames/explore/cloud/` in the spool repo (run `pnpm dev skill` first), dark first, each variation its own frame.
- Skills: /grilling and /domain-modeling for decisions, in prose, one question at a time; /research for research; /prototype and the designer agent for prototypes.
- Spikes and experiments run on Opus. Reading-only research may run on Sonnet.
- Everything here is private. Only implementation-ready work about the published product goes to public GitHub issues, decided before posting.

## Decisions so far

- Research: how design tools let a team work together (#6): the common 2026 shape is a cloud canvas with code in the customer's git; viewers are free almost everywhere and edit seats pay; [Pen.dev](http://Pen.dev) went to cloud workspaces with comments on 2026-09-30 and documents lost work from file conflicts.
- Research: keeping git and a hosted copy in step, and branch previews (#7): every two-copy product picks a winner and some lose hosted edits; nobody builds a branch on first visit; only Chromatic mirrors repo permissions; Spool's `design/` reads at a branch in one call.
- Research: opening a prototype on a phone so it feels native (#9): any iOS 26 site saved to the Home Screen opens as an app; the shared website has no app manifest or safe-area handling; the export fails from `file://` and plain http, so local phone paths don't work today.
- Research: presence, locks and feedback in multiplayer tools (#10): presence is a cheap broadcast; agents show up as status lists more than cursors; file locks throttle agents badly, separate copies and claims work; Spool's agent hand has no identity and is per machine.
- Research: teams, seats and billing (#11): single sign-on and audit logs always sit above the first paid tier; free viewers are common but Linear and GitHub bill guests; second-person gates exist at Vercel, Sentry and [Cal.com](http://Cal.com); merchants of record cost 3.5 to 5% over Stripe and take the VAT work.
- Research: mounting a cloud folder into a local project (#12): a mounted `design/` never goes unnoticed (File Provider can't sit in a repo, a symlink breaks Spool and git); on real mounts the watcher misses other machines' changes for seconds to minutes, edits get silently lost, small files are 10 to 60 times slower, and cloud agents see only the git clone.
- Research: why sharing fails on some frames (#4): the navigation check before export refuses 631 of 752 frames, a third of them falsely (motion components and prop spreads); `?raw` imports are dropped by the exporter; past the check every frame built and played; an older Cloud validator rejects all paged frames; the panel shows one problem with no location.
- Research: keeping one folder in sync across machines and the cloud (#5): file sync tools never merge, CRDT libraries merge by character, database sync engines don't do files; character merging of two agents' rewrites mostly compiles but can produce wrong values silently, and a regenerated file merged with an edit broke 6 of 7 times; a whole canvas in one Durable Object sits near its memory limit.
- Research: how fast and heavy a live update is (#8): a frame edit moves about 1 KB compiled, a shared component tens of KB; the slow part is today's exporter (3 to 13 s), not the network, while a warm compile of what changed takes 0.15 to 1.1 s; compiling in a Worker works and runs no author code but contradicts the beta's keep-source-local decisions; about 1 s keeps flow.
- Decide where a team's design lives and how changes travel (#13): one live canvas per team project. Every member holds real files, Spool Cloud relays each saved file whole in about 1 s, and the cloud keeps the team's copy and history. `design/` leaves git on a team project, branches are ignored, there's no private mode, and Spool's servers can read the source.
- Prototype live cursors and who's looking (#14): people only. A pointer with a name pill that fades once they stop. Idle dims, and leaving fades out. The pill docks on a frame's name while they're inside it live. Dragging turns the pointer into a hand. The faces at the top right follow on press.
- Prototype the team's home in Spool Cloud (#22): a switcher at the top of Home's sidebar picks one team at a time (your own projects are one entry, a person can be in several teams); a team's Home is the shipped cover grid with who's inside on each cover; a team project's link opens spool on this Mac, with looking in the browser as the fallback.
- Decide what happens when two writers change the same file (#17): no locks. In a collision the first save to reach the cloud stands and the later one is set aside in history, with a mark offering compare, put mine back or hand to agent. An edit beats a delete, `canvas.json` merges key by key, and agents rely on their own stale check.
- Prototype the read-only cloud canvas (#15): in a browser, the shipped canvas with every authoring control taken off (pages rail, own camera, no tools, dock, agent or selection); clicking a frame grows it into the player. Members see it live with who's looking; an outsider sees only the shared pages and is invisible. The phone moved to the phone ticket.
- Prototype a shared link on a phone (#16): opened from the Home Screen, a link runs full screen like an app. The export adds a name, icon, manifest, no width cap on phones and a full-height frame. The frame gets the real safe areas and pads itself. A once-only card in the phone browser explains Add to Home Screen. Push, shared-element and gesture motion work across walks. The team canvas on a phone split into its own ticket.
- Decide what a teammate's files may do on your machine (#21): teammates are trusted like git collaborators and joining is the only approval. A sync writes only Spool's own layout (no symlinks, modes or foreign dot-folders), checked again by every receiving daemon. Frames go https-only everywhere, the daemon's font fetch refuses local addresses, agents are unchanged, and removed members are cut off at the cloud.
- Decide teams, roles and invites (#19): two levels, a team and its team projects, with no organisation. One account per verified email (Google, email code, passkeys). Admin, editor and viewer, all team-wide. The repo grants nothing. Admins invite by exact email. Outsiders are accounts on shares the team owns. Beta approval becomes a gate on creating a team until launch.
- Research: Better Auth on Workers and D1 for Spool Cloud accounts (#45): it runs on Workers and D1 (no transactions; two open Workers bugs at 1.7.7) and covers Google, codes, passkeys, roles and invites, but stores session tokens raw and leaves send budgets, eligibility, the CLI handoff and per-host access to app code; beta sessions can't be imported.
- Decide what the cloud builds and serves (#18): Spool Cloud compiles from source with core's own code when a frame is opened (79% fewer compiles than every save, measured on real sessions); sharing never refuses, as the navigation check and exporter retire and access is checked per page when a frame opens; outsiders see settled pages, the last version that compiled, and covers from members' daemons.
- Research: cloud compile on Cloudflare itself (#41): on production the Worker gives the same bytes as native core, but Cloudflare bills 2 to 3 times local CPU (median 0.53 s for a new frame, up to 4.6 s for a fresh isolate's first compile); isolates are usually cold, a warm Durable Object doesn't reliably help, a teammate watching live waits a median 1.3 to 1.8 s, and Durable Object SQLite is the fast store (3 ms reads), R2 the slow one.
- Decide what a team pays for (#20): every editor is a seat once a team has two, after 14 days' grace; solo and one-editor teams are free, viewers and outsiders always. One plan at $20 per editor monthly or $16 yearly, admins add editors, a lapsed team drops to free, plain Stripe on Mojo AB from the first team version.
- Prototype signing in and running a team (#44): People and Settings pages under the switcher, the same at [spool.page/](http://spool.page/); role menu of names only, the cost said in a confirm; settings start with the team's logo; one sign-in page with Google and an email code; an invite is a line on Home; a project's shares are a quiet popover at the canvas's top right.
- Prototype the team canvas on a phone (#47): on a phone, a team canvas link gives the navigator (recent changes, the page tree, find) and play, with no spatial canvas. Play runs the frame live, a pull from the right edge leaves, and turning the phone plays desktop frames.
- Decide how a project becomes a team project and reaches each member's machine (#43): a team project lives in the cloud and machines hold local copies, real `design/` folders Spool keeps out of git itself, with a tracked `spool.json` link beside them. Team members choose at `spool init` (`--team` or `--local`), any `spool` command fetches a missing folder, "Get it" offers a checkout or "just on this Mac", moving an existing project is one Spool commit after the upload, and git never writes to the team's copy.
- Research: what a team costs to run (#42): a team project costs Spool $0.07 to $4.68 a month at 2 to 8 editors, a free one-editor team $0.04 to $1.52, so $16 per editor keeps 86 to 97% after Stripe; the sync Durable Object must hibernate, native compile doesn't pay for itself, and the proposed fair-use limits are 1 GB of `design/`, 5 GB of history (1 GB and 90 days on free), set-aside saves kept 90 days, and 30,000 saves per editor a month.
- Decide where the cloud compile runs (#56): on Workers, in a compile Durable Object per project apart from the sync object, with no native service (coolify-main, devobee, a box and Containers all ruled out); editors already get about 1 s from their own daemon and browser viewers accept about 1.3 s; core uses the JS class scanner everywhere and factors its compile for a Worker; output in the object's SQLite behind the edge cache.

## Not yet specified

- Decide history and restore for team projects (#57). History and restore in the cloud: now required, since git no longer keeps a team project's history. What a team can roll back, and how. Includes how long set-aside saves are kept.
- Decide how a broken sync is noticed and fixed (#58). Recovery: offline work catches up on reconnect (decided). Open: how a broken sync is noticed and fixed, and members running different Spool versions.
- Decide what happens to the beta's publications and links (#59). What happens to the beta's existing share links, invitations and publications once a team version exists. How sharing builds is decided; what's open is moving what's already out there, and whether a publication and its version stay words at all. Its people are decided: publishers become accounts, and invited viewers become accounts with outsider access.
- Decide what tells a member something changed (#60). Notifications: what tells a member that something changed, including whether a share's maker hears when someone else stops it.
- Assembling the spec: split into five specs, written 2026-10-05 from the decisions so far. Core ready for team projects and cloud compile (#61), accounts, teams, roles, invites and billing (#64), team projects synced live (#65) (blocked on #57 and #58), the cloud compiles, serves and shares (#62) (blocked on #59), and live cursors and who's looking (#63). Each spec's undecided parts get filled in as the four decisions above close.

## Out of scope

- Agents running on Spool's servers. Agents stay on members' machines or in their own cloud agents. The design folder may come to the members; the agents don't come to us.
- A native Spool phone app and AirDrop to the phone: Idea: a Spool phone app for trying prototypes like a native app (#2). How a shared link opens on a phone stays in scope.
- Slide decks and other project types: Idea: slide decks as a Spool project type (#1).
- Enterprise extras: single sign-on, audit logs, compliance.
- Signed saves, so a compromised cloud can't impersonate a teammate: Idea: signed saves on team projects (#40). Past the first paid version, beside end-to-end encryption.
- How people's agents show up on a team canvas: Idea: how people's agents show up on a team canvas (#38). The first team version shows people only, as live cursors and who's looking; agent presence gets its own effort.
- Finishing the sharing beta: its own track, [the human release checks](https://github.com/liamvinberg/spool-cloud/issues/177).
- Fixing why sharing fails on some frames: the research ticket here finds the cause, and the fix becomes a normal bug ticket.
- An organisation over several teams, with per-team admins and access: Idea: an organisation over several teams (#46). The first paid version has teams and nothing above them.
- A canvas of what's on `main` in the linked repo: Idea: a canvas of what's on main (#48). The first paid version sells the live canvas only.
- Editors requesting a seat for an admin to approve: Idea: editors can request a seat (#49). Admins add editors in the first version.
- Comments and reactions on the team canvas and shared pages: Idea: comments on shared pages, from members and outsiders (#50), out by Decide whether outsiders can comment, and where comments live (#39). The first version is built for Devosurf, who wouldn't use them, and outsiders stay invisible.
- The canvas on a phone (reflowed pages, swiping between frames, the map scrub), prototyped as `reach` on real projects: Idea: the canvas on a phone (#53). Liam thinks it beats what v1 ships, so it should be surfaced again after v1.
- Recent changes as the way into any project, solo and on the desktop: Idea: recent changes as a way into a project (#52). The first version has it only in the phone's navigator.
- Agents running in the cloud (Claude Code on the web, Codex cloud, Cursor, Copilot) on a team project: Idea: cloud agents drawing on a team canvas (#54). The first version accepts that they can't fetch or save the folder.
- Moving a team project between teams: Idea: transfer a team project to another team (#55).

*From Linear DEV-102.*

Related: #38, #40, #46, #48, #49, #50, #51, #52, #53, #54, #55, #57, #58, #59, #60, #66, #67, #68, #73, #76, #79, #80, #83, #84, #89, #90, #112, #122, #129, #2

Plane: SPOOL-3

## Comments

### agent, 2026-10-18T17:43:57.108Z

**Liam, 2026-10-05:** Run decisions from Liam (2026-10-05) for the first implementation run:

- **Scope: Devosurf dogfood.** Billing is deferred: #70 is in Backlog and not part of this run. Keep the team model ready for billing to plug in later (seats are editors), but build no Stripe flows, seat counts or payment UI. Devosurf is a team with no billing at all.
- **Releases:** the agent may merge the `release: spool.page` PR itself when a core release is needed.
- **Deploys:** the agent may deploy to `spool.page` production, not just `beta.spool.page`.
- **Public issues:** none. Core tickets (#66, #67) stay in Linear; commits and changesets go to GitHub as usual.
- **Credentials:** all in place. See the comment on #68.
- **Still open and Liam's:** #57, #58 and #59 (#59 blocks #80), and the iPhone check on #79.

### agent, 2026-10-18T17:43:57.115Z

**Liam, 2026-10-06:** Run closed out (2026-10-06).

Live:
- spool.page 0.28.0, 0.29.0, 0.30.0 and 0.31.0 are on npm. From 0.31.0, spool signs in to spool.page by default.
- beta.spool.page and spool.page both run accounts, invite-only sign-in, teams, team sync, the browser canvas, shares, phones and presence.
- Devosurf is set up on both. Liam is admin, asim01.syed and morgan.jonasson are editors, and the logo is set.

Done: #61 and #63, and tickets #66, 182, 183, 184, 186, 187, 189, 190, 191, 192, 193, 196 and 197.
Still open: #62, #64 and #65 (specs), #73 and #79.

Left, all Liam's:
- Decide #57 (history, restore, how long set-aside saves are kept). #73's last criterion waits on it.
- Decide #58 (a broken sync, members on different versions, alerts).
- Decide #59 (the beta's publications and links). #80 waits on it.
- #70, billing, is deferred.
- The real iPhone check on #79. The steps are on the ticket.
- Checks on real devices are listed on #68, 184, 186, 187, 189, 190, 191, 192, 193, 196 and 197.
- Make the compile-limit alert in the Cloudflare dashboard. The run's logins can't use the SQL API, so it couldn't be made from here. About 2 minutes:
1. Alerts → Create → Custom Alert.
2. Name: spool compile limit.
3. Destination: email vinberg.liam@gmail.com.
4. Custom SQL, Automatic time range:

```
SELECT COUNT(*) AS value
FROM logs.workersLogs
WHERE accountTag = 'd2b578c66c7297496ef5b60c60895c81'
  AND scriptName IN ('spool-cloud', 'spool-publications', 'spool-cloud-beta-test', 'spool-publications-beta-test')
  AND attributes['alert'] = 'compile_limit'
```

5. Threshold > 0, execution interval Default (1 min), repeat notification 1h.
   Or make an API token with Account Analytics read and Notifications edit, and send the same alert through the API.

Found in review and not fixed:
- Deleting your own account isn't built. It needs a ticket.
- A removed project's sync history is kept, but nothing can reach it. Part of #57.
- The "never idles" sync alert is a log line that goes nowhere. Part of #58.
- Signing out in a browser doesn't cut that browser's presence until the next save.
- Old sign-in attempts, handoffs and passkey challenges are never cleaned up.
- Small tidy-ups in core: describeChoice repeats saidList, PartFaces uses a word the glossary doesn't have, and Home's and the share sheet's Initial avatars still differ.
- There is no test for the 1 GB refusal of solo uploads.
- Two compile changes that can break a frame went out as patch in 0.28.0, and some changesets landed in commits of their own. Follow docs/releases.md next time.

Also Liam's call:
- Beta's copy of Devosurf can go once everyone is on 0.31.0. Beta projects don't move over by themselves.
- Whether to commit the deploy receipts helper as scripts/publication-receipts.mjs. Each run sends one test email to Resend's sink.

### agent, 2026-10-18T17:43:57.124Z

**Liam, 2026-10-10:** Public launch continues on Wayfinder map: Spool Cloud public launch (#89) (2026-10-09, Cata). Moved there: #83, #57, #58, #59. #20's free one-editor team is being reopened there as #90 (Spool Cloud is paid only). This map keeps its open specs and #60.

### agent, 2026-10-18T17:43:57.132Z

**Liam, 2026-10-11:** Closed on 2026-10-11 (agent-hub task 123). The first version is live for Devosurf since spool.page 0.31.0 and every spec here is built. What carries on lives on Wayfinder map: Spool Cloud public launch (#89):

- Its two open decisions moved there: Decide whether an agent may move a project into a team (a CLI verb) (#84) and Decide what tells a member something changed (#60).
- Billing (#70) is rewritten by Spec: buying and paying for a team (#112).
- Still open on their own: Retire the beta's exporter and move existing publications (#80) and the iPhone check on Phones: the shared-link shell and the team canvas navigator (#79).
- The ideas stay in the Spool backlog.
