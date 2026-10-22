# #117 · Spec: running Spool Cloud for paying teams

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.505Z
- Updated: 2026-10-21T20:57:20.006Z
- Closed: 2026-10-21T20:57:20.006Z

## Problem Statement

Spool Cloud takes money now, but several things decided before taking it are still missing. If sign-in mail stops, nobody hears of it. Today it stops for everyone at 100 mails a day, which is Resend Free's cap copied into code. The sign-in form has no bot check: Turnstile guards only the waitlist. The Worker writes alert lines (`team_sync_never_idles`, `compile_limit`, `bucket_waiting`) to Workers Logs, but nothing reads them, and there is no alerts channel. spool-cloud has no CI, so a deploy ships whatever the working tree holds.

Members are not covered either. A local copy that has drifted from the team's copy is only noticed by the person who sees a wrong frame. When the line is down, the canvas says nothing. There is no way to make a local copy match the team. A member on an older Spool is refused with 4406 and retries in silence forever, with no word to update. Nothing acts on the team's format.

## Solution

For the operator: one command deploys, but only code that CI passed. Sign-in is guarded by Turnstile and one WAF rule. The daily mail cap becomes a circuit breaker that alerts when it trips, not a quiet ceiling. Every alert lands in one alerts channel under Spool in Discord. Each message there is something to fix, and the channel is quiet on a normal day.

For a member: sync shows nothing while it works. Each time a daemon connects, it compares a fingerprint of its local copy with the team's copy and silently repairs any Drift; Spool is told. After 30 seconds without a connection, the Sync box says "Offline. Your changes go up when you're back." **Match the team** in the project menu, and in the Sync box when it shows, makes the local copy the team's version and keeps every local difference as a set-aside mark. A member on an older Spool is **Paused** and told "Update Spool to keep syncing with <team>", with a way to update. The first member who updates moves the team's format forward.

## User Stories

1. As the maintainer, I want every push and pull request to spool-cloud to run typecheck, Biome and the tests, so that a broken change is caught before it ships.
2. As the maintainer, I want one command to deploy spool-cloud only from a commit CI passed, so that a deploy never ships an untested tree.
3. As the maintainer, I want the deploy to keep doing what `pnpm deploy` does today (secrets check, migrations, app Worker before serving Worker), so that there is one deploy path, not two.
4. As the maintainer, I want spool's release to refuse to publish a daemon whose sync protocol the deployed cloud doesn't accept, so that the cloud is always deployed before the release that needs it.
5. As a person signing in at spool.page, I want the bot check to be invisible unless Cloudflare doubts me, so that signing in stays one step.
6. As the maintainer, I want every sign-in code send and resend checked with Turnstile on the server before the send budget runs, so that a script can't spend our mail.
7. As an outsider signing in on a link share's host, I want the same check there, so that link hosts aren't the unguarded way in.
8. As the maintainer, I want one WAF rate-limit rule on the sign-in routes, so that a flood is stopped at the edge before it reaches the Worker.
9. As the maintainer, I want the 100-a-day cap on all mail replaced by a circuit breaker well above a normal day, so that sign-in doesn't stop at a growing team's first busy morning.
10. As the maintainer, I want an alert when the breaker trips, so that a mail bug or an attack is something I hear about, not something members hit.
11. As the maintainer, I want an alert when Resend refuses or fails our mail, so that I know sign-in is down before anyone writes in.
12. As a person signing in, I want the per-mailbox and per-address budgets to stay as they are, so that nobody can flood my inbox.
13. As the maintainer, I want one alerts channel under the Spool category in Discord, fed by webhook, so that every alert is in one place I read.
14. As the maintainer, I want Worker errors grouped by Workers Issues and posted when a new one appears or an old one returns, so that I see each failure once, not as a stream.
15. As the maintainer, I want an alert when a sync object never idles, so that a cost leak is fixed the day it starts.
16. As the maintainer, I want an alert when frames hit the compile limit, so that I know a team can't see its frame.
17. As the maintainer, I want an alert when the five-minute cron goes silent, so that trials, lapses and purges don't quietly stop.
18. As the maintainer, I want an alert when spend crosses a line, so that a runaway agent or loop costs a warning, not a bill.
19. As the maintainer, I want an alert when a daemon reports Drift, so that a sync bug that should never happen is seen the first time it does.
20. As the maintainer, I want the alerts kept in a script that sets them up the same way each time, so that they can be read, reviewed and recreated.
21. As an editor, I want my daemon to check its local copy against the team's copy every time it connects, after the catch-up, so that a missed relay or write is found without my doing anything.
22. As an editor, I want a mismatch fixed file by file, only for the files that differ, so that a repair costs as little as the drift.
23. As an editor, I want the repair to be silent, so that sync shows nothing while it works.
24. As an editor whose local copy lost its sync record, I want it to take the team's version and keep my differences as set-aside marks, so that I lose nothing and match the team.
25. As an editor, I want a repair never to overwrite a local change I haven't sent yet, so that my unsent work still goes up under the collision rule.
26. As an editor, I want a wake from sleep or a dead line to run the same check, since it reconnects, so that a Mac that slept through teammates' saves catches up and is checked.
27. As an editor, I want the Sync box to say "Offline. Your changes go up when you're back." after 30 seconds without a connection, so that I know why teammates' work isn't arriving.
28. As an editor, I want the offline line gone the moment the connection is back, so that it never lingers.
29. As an editor, I want a short blip under 30 seconds to show nothing, so that a network hiccup doesn't make noise.
30. As an editor, I want Match the team in the project's menu, so that I can make my local copy the team's whenever I doubt it.
31. As an editor, I want Match the team in the Sync box when the box is showing, so that the fix is beside the problem.
32. As an editor, I want Match the team to keep every local difference as a set-aside mark, so that Put mine back still brings any of it back.
33. As an editor, I want Match the team to leave files that didn't travel alone, so that my over-25 MB video isn't deleted.
34. As an editor offline, I want Match the team to say it needs a connection, so that it never half-runs.
35. As an editor on an older Spool, I want my files to stay editable and my changes to stay on this Mac, so that an update is never urgent.
36. As an editor on an older Spool, I want the Sync box to say "Update Spool to keep syncing with <team>" with the Mac app's update button, so that one click fixes it.
37. As an editor using the CLI, I want the same line to give the npm command to update, so that I know what to run.
38. As an editor who updates, I want sync to resume on its own and my changes kept on this Mac to go up under the collision rule, so that the pause costs nothing.
39. As an editor, I want an older Spool's pause to count as Paused, not Offline, so that the box tells me what to do.
40. As an editor one release behind, I want the cloud to still accept my protocol, so that a release doesn't stop the whole team at once.
41. As the first editor on a Spool with a new design/ format, I want my daemon to catch up first, then migrate, then send the result as ordinary saves, so that the team moves forward with me.
42. As an editor on the newer format, I want my own unsent changes migrated before they go up, so that the team never receives old-format files from me.
43. As an editor still on the old format after a teammate moved the team forward, I want to be Paused with the update line, so that my old daemon never writes old-format files over the team's.
44. As an agent working in a paused local copy, I want the next `spool` command to say sync is paused and why, so that I don't assume teammates see my work.

## Implementation Decisions

**Sync protocol (spool's sync protocol module, imported by the sync object as `spool.page/sync-protocol`)**
- Additions are optional and announced in `hello`, as `bundles` and `ticks` are, so `PROTOCOL_VERSION` stays 2 for this work. An object that doesn't know a field ignores it, and so does a daemon.
- **Fingerprint.** It is one hash over every path in the team's copy, sorted, each with its content hash, deletes left out. The object and the daemon compute it the same way from what each already keeps: the object from its `files` table, the daemon from its sync record's per-path hashes, checked against the files on disk. One shared function in the protocol module computes it for both.
- A daemon that says `hello.checks` gets a `fingerprint` message right after `caught-up`. If its own differs, it sends `list`. The object answers with every path, version and hash, paged like a catch-up. The daemon then asks only for the paths that differ (with `resend`, which exists) and writes them, using the rules the catch-up uses for unsent local changes.
- After a repair, the daemon sends `drift` with a count of the paths it repaired and the cause (`lost_record`, `missed`). It never sends paths or contents. The object logs `team_sync_drift` as a structured error line naming the object and the counts.
- **Protocol range.** The object accepts the current `PROTOCOL_VERSION` and the one before it. The accepted range is a protocol constant. A public, unauthenticated GET on spool.page returns the protocols the deployed cloud accepts.
- **Team format.** Today the object records only the format a project started in (`INSERT OR IGNORE`). It now keeps the team's current format. Applying a `canvas.json` save whose `format` field is higher raises it. A daemon whose `hello.format` is lower than the team's is closed with a new code that means "update Spool" (format). An unsupported protocol keeps 4406.

**Daemon (team sync)**
- On a `fingerprint` that differs, the daemon repairs as above. That check is the drift repair; there is no timer scan. Pings already exist: every 15 s, and a line counts as dead after 10 s of silence. They trigger a reconnect, and the reconnect runs the check.
- **Lost record.** A local copy whose link to the project is known but whose sync record is missing or for another project takes the team's version of every path, and each local difference becomes a set-aside mark (open question 1). A copy that was never synced keeps today's Get it and move rules.
- **Match the team** is one operation on a local copy, shared with the lost-record repair. It needs a caught-up connection. It makes every travelling path the team's version, records each local difference as a set-aside mark (an addition the team lacks is a mark too), and leaves files that didn't travel alone. Tell the person nothing beyond the set-aside notice that already exists. It is exposed as a daemon route for the canvas, with no CLI verb.
- **Offline.** `SyncState` gains `offline` (true after 30 s without a caught-up connection, while the copy is followed and not ended, gone local or paused) and `update` (for an older Spool: the team's name and how to update, app or CLI). Each change fires the existing sync-change event.
- **Paused for an update.** Close 4406, or the new format close, pauses the copy as a fair-use limit pause does. Files stay editable, changes wait on disk, and an exponential re-ask (hourly at most) goes on, so an update made outside the app is picked up. The pause lifts when the daemon restarts on a newer Spool. The project verbs that already print what didn't travel also print the pause.
- **Format migration on a team project.** A local copy of a team project migrates only after it is caught up, never on first read before the catch-up. The migration's writes go up as ordinary saves, its unsent changes included. A project's own read path keeps migrating solo projects as now.

**Canvas (Sync box and project menu)**
- The Sync box is today's sync notices in the notice stack. It gains the offline line, the update line (in the Mac app, the desktop bridge's update action; in a browser-served canvas, the npm command), and a Match the team action on any of its lines. The project tab's menu gains Match the team for team projects. That matches the History… / Match the team pairing already drawn on the design canvas (`cloud-history`), but this ticket set ships Match the team alone.
- The copy is the decided copy: "Offline. Your changes go up when you're back." and "Update Spool to keep syncing with <team>". The design canvas mirror of the Sync box (`frames/app/spool-canvas--sync`) and the tab menu frame are redrawn to match. They are canvas saves, never committed.

**Sign-in guard and mail (spool-cloud auth)**
- Turnstile's server check (it already exists for the waitlist) is generalised to take its action as an argument. Sign-in uses its own action and its own widget on the server-rendered sign-in pages at spool.page and on link-share hosts. The token is checked on `/sign-in/code` and `/sign-in/code/resend`, and on the link-share code request, before the send budget runs. A failed check sends nothing and asks again. The pages' CSP allows Turnstile's script and frame.
- The global daily cap in the send budget goes from 100 to a breaker constant of 1,000 a day. That is about ten times today's busiest day, and the constant is raised as volume grows. Whenever a refusal comes from the breaker and not from a per-mailbox or per-address budget, the Worker logs `email_breaker`, once an hour at most. Every other budget stays.
- A Resend refusal or failure after retries (429, 5xx or a rejected send) logs `email_unavailable` with the status and kind, never the address.
- The WAF rule is one rate-limit rule on `/sign-in/*`, as wide as the zone's plan allows (on Free: per IP over 10 s). It is kept in the ops script below, beside the alerts.

**Alerts and CI (spool-cloud ops)**
- An idempotent ops script, run like the Stripe price script, sets up the following through the Cloudflare API: the Discord webhook destination, a Workers Issues automation on both Workers, and Custom Alerts on the log lines `team_sync_never_idles`, `compile_limit`, `team_sync_drift`, `email_breaker`, `email_unavailable` and a cron heartbeat that is missing for 15 minutes. It also sets the WAF rule and a billing budget alert. `observability.issues` is turned on in the Wrangler configs, and Wrangler is raised to a version that supports it.
- The scheduled handler logs one heartbeat line per run, after its jobs.
- `bucket_waiting` stays a log line with no alert: waiting on the bucket is pacing, not a fault.
- The alerts channel is a Discord channel in the Spool category, made with its webhook through agent-hub's discord tools. The webhook URL is kept in Infisical's spool-cloud workspace, never in the repo.
- CI is a GitHub Actions workflow on spool-cloud: install, typecheck, `biome check`, the unit, worker and node tests, on every push to main and every pull request. A deploy workflow, started by hand, runs `pnpm deploy` for production from a commit whose CI passed (open question 2).
- spool's publish workflow reads the deployed cloud's accepted protocols and fails if the package's `PROTOCOL_VERSION` isn't among them.

## Testing Decisions

- Test what a person, an agent or the operator would see: files on disk, set-aside marks, `SyncState`, what a `spool` verb prints, HTTP answers, log lines. Never internal state.
- **One main seam: spool-cloud's team e2e** (`e2e/team`), with real daemons from a built spool checkout against the sync object in Miniflare. Drift, lost record, Match the team, offline, the update pause and the format move are tested there. Prior art is `e2e/team/sync.test.ts`, `local-copies.test.ts` and `collisions.test.ts`.
- Below it, the daemon's own team-sync tests with the fake cloud from spool's team-sync test harness cover the cases the e2e can't stage cheaply. These include a line that goes silent (the quiet-server tests already there), 30 s offline with fake timers, and 4406 and the format close. The harness learns `fingerprint`, `list` and the format close. Prior art is `team-sync.test.ts`.
- The sync object's worker tests (`sync.worker.test.ts`) cover the fingerprint, the paged list, the accepted protocol range, the format being raised, and `team_sync_drift` being logged.
- The canvas's sync-state tests cover the new lines and the Match the team action (`sync-state.test.ts`, `set-aside.test.ts`).
- The auth worker tests cover Turnstile on each code route, with Cloudflare's test secrets as the waitlist tests use them, plus the breaker and `email_breaker`/`email_unavailable` (`providers.worker.test.ts`, `app.worker.test.ts`). Turnstile and Resend are never called for real in tests.
- The ops script gets a dry-run mode that its test runs against a recorded API shape. The live run is checked once by hand: a test message in the channel.

## Out of Scope

- Backups, restore from backup, the restore epoch in `welcome` and history retention: these belong to Spec: team history, restore and backups (#114). It reuses this spec's fingerprint check, because after a restore every daemon runs the full check.
- Catch-up chunking, presence, reconnect spreading and agents hearing about held files: already built in #104 and #107 to #110.
- The Resend bounce and complaint webhook, a stricter DMARC policy, pruning `email_send_reservations`, a size alert per sync object, a Workers rate-limit binding, gradual rollouts, and a status page or support (Decide support for paying teams and a status page, #120).
- Stripe Radar and webhook-failure alerts: these stay in Stripe's dashboard.
- Forced updates: an update is never forced.

## Further Notes

**Audit of what ships (spool main b9089592, spool-cloud main 5c36bcf):**
- **CI and deploy.** Partial. `pnpm deploy` (`scripts/publication-release.mjs`) is already one command: secrets check, migrations, build, app Worker then serving Worker. spool-cloud has no `.github` and no CI. spool has its own `ci.yml` and `publish.yml`, but publishing doesn't check the cloud's protocol.
- **Sign-in guard.** Missing. Turnstile is only on the waitlist (`src/worker/waitlist/turnstile.ts`, `src/site/home/turnstile.tsx`). The code routes in `src/worker/auth/account-app.ts` and `src/worker/shares/link-sign-in.ts` have none. Nothing in the repo sets a WAF rule, and the zone plan is unknown.
- **Mail cap.** Missing. The 100-a-day global cap is still in `sendBudget` (`src/worker/auth/challenges.ts`). A send failure is only an `auth_events` row, with no log line. DMARC `p=none` has been on `_dmarc.spool.page` since 2026-10-20 (task 199). Whether Resend is on Pro is unknown.
- **Alerts.** Partial. The lines `team_sync_never_idles` (`src/worker/sync/object.ts`), `compile_limit` (`src/worker/frames/limit.ts`) and `bucket_waiting` are logged. `observability.issues` isn't enabled (Wrangler ^4.114 is below 4.134). There is no Discord channel or webhook, no cron heartbeat, no email lines and no `team_sync_drift`. The repo shows no alert configuration.
- **Dead line.** Shipped. Pings go every 15 s and a line is dead after 10 s of silence (`SOCKET_TIMING`, `openWebSocketWith` in `src/daemon/team-sync.ts`). Reconnect backoff is shipped too (`src/reconnect-backoff.ts`, #109).
- **Local edits while the daemon was off.** Shipped: `checkEverything` runs at caught-up.
- **Fingerprint check and drift repair.** Missing. Per-path hashes exist on both sides: the daemon's `sync.json` and the object's `files` table. There is no fingerprint or list message, and no drift report.
- **Lost record.** Missing. A missing record is read as an empty one (`readState`) and treated as own work, so the local files go up.
- **Offline line.** Missing. `SyncState` (ended, goneLocal, paused, sending, held) and the Sync box (`src/ui/canvas/sync-state.tsx`) have no offline state.
- **Match the team.** Missing from `src/ui/project-tab-menu.tsx` and the daemon. Set-aside marks and Put mine back exist (`src/daemon/set-aside.ts`) to build on.
- **Older Spool.** Missing. The object accepts only one exact protocol, and the daemon's close handler reconnects silently on 4406. The update bridge exists (`src/ui/desktop-bridge.ts`, `desktop/src/updates.ts`).
- **Team format.** Missing. It is recorded once and never raised, and the daemon ignores `welcome.format`. `migrateFrameNames` runs on first read whether the project is a team project or not.
- **Glossary.** **Drift** and **Paused** are only on spool-cloud's unmerged branch `110-wayfinder-dev-172` (f854836). They land with the tickets that build them.

**Needs Liam outside code:** buy Resend Pro ($20/month) before the breaker goes in. Check the zone plan for `spool.page` and `onspool.page`. Create a Cloudflare API token with Notifications, WAF and Workers Observability rights for the ops script, and a token for the GitHub deploy if open question 2 goes that way. Choose a spend line for the budget alert.

## Open questions

1. **Lost record against Get it.** Decision #58 says a local copy that lost its record takes the team's version and sets its differences aside. Prototype #96 and today's code say a copy with no record sends the files only it has. Both describe an empty record. *Recommendation:* use #58's rule only when this machine already knows the copy was synced (its copy record names the project but `sync.json` is gone or names another one), and keep #96's rule for a copy that was never synced.
2. **Where a deploy runs.** One option is a hand-started GitHub Actions job, which needs a Cloudflare deploy token stored in GitHub. The other is local `pnpm deploy`, refusing any commit whose CI hasn't passed. *Recommendation:* the GitHub job, so a deploy is one button, logged, and never from a dirty tree. The token covers Workers and D1 for this account only.
3. **Spend alert destination.** Cloudflare's budget alerts may only email. *Recommendation:* accept email to Liam for spend, with everything else in Discord, and don't build a relay.

Related: #110, #107, #104, #94, #89, #58

Plane: SPOOL-117

## Comments

### agent, 2026-10-21T16:56:20.978Z

Spec and build tickets written (agent-hub task 205). The body is the spec, with an audit of what already ships in its Further Notes and three open questions at the end. Six tickets, parent #117: #201 CI and a deploy only from green; #202 the alerts channel; #203 the sign-in guard and mail breaker (blocked by #202); #204 the fingerprint check and drift repair (blocked by #202); #205 Offline and Match the team (blocked by #204); #206 an older Spool is paused and the team's format moves forward (blocked by #201). Before #203 and #202, Liam needs to: buy Resend Pro, check the zone plan, create a Cloudflare API token and pick a spend line.

### agent, 2026-10-21T20:57:20.006Z

All six children built and merged (spool f5fe825d, spool-cloud 4bf3938). Left for Liam: Resend Pro then breaker to 1,000; zone plan + WAF rule + alerts via scripts/cloudflare-alerts.mjs; Discord alerts channel/webhook/Infisical secret; CLOUDFLARE_API_TOKEN in GitHub and a first deploy through the workflow; design/frames/app Sync box and tab menu mirrors. Reaching users needs a spool-cloud deploy, then a core release; the spool.page pin bump can then replace spool-cloud's protocol mirrors.
