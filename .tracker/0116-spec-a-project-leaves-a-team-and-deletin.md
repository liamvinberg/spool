# #116 · Spec: a project leaves a team, and deleting an account

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.494Z
- Updated: 2026-10-21T19:58:10.146Z
- Closed: 2026-10-21T19:58:10.146Z

## Problem Statement

A team on Spool Cloud has no safe way to let a project go and no way to take its data with it, and a person has no way to leave Spool Cloud by themselves.

- **Removing a project is final the moment it's confirmed.** "Move out of <team>" (and `spool move --out`) deletes the team project's row at once: its shares are deleted with it, its comments go, its compiled frames and covers go, and nobody can bring it back. Yet the team's copy and history stay in the sync object forever, unreachable and never purged. A misclick by an admin costs the team every share link and comment, while the data the team asked to be rid of is never actually deleted.
- **A teammate whose copy ended has no way to get `design/` back into git** unless the admin's move-out commit reaches them. When a team lapses, when someone is removed, or when the project was removed from a Mac without a copy of it, the copy just stops: `spool.json` stays tracked, `design/` stays ignored by its `.gitignore` of `*`, and putting it back into git is a manual job.
- **Nobody can delete their own account.** It takes the maintainer's route. Someone who is the only member of their team can't be deleted at all, because the route refuses every last admin. When a deleted account was a team's Stripe billing contact, the team's invoices keep going to an address nobody reads.
- **A deleted person disappears from the team's record.** The phone navigator's recent list drops every save made by an account that is gone, as if those saves never happened.
- **A team can't take its work out.** "Export project…" packs one local folder into a `.spool` archive. It has no team history, no authorship and no members. An admin leaving Spool Cloud, or whose team ended, has nothing to take. The Data Act's retrieval window (#93) assumes they do.

## Solution

- **Removed projects wait 30 days in the trash.** Removing a project from a team (by moving it out, from the app or `spool move --out`) takes it out of everyone's sync at once, as today, but Spool Cloud keeps its copy, history, comments, covers and shares for 30 days. Its shares pause and its name stays reserved. Any admin can **Restore** it from the team's Projects page, on the Mac or at spool.page, and everything comes back: shares, comments and the address. Members get it back with Get it. **Delete now** purges it at once. After 30 days it is purged for good. Every teammate's notice says who removed it: "Ana removed tidemark-app from Tidemark. It's now a project on this Mac only."
- **Put design/ back in git** on any copy that ended or went local in a checkout: one action, in the app only, on the copy's notice and its cover menu. It makes one commit on the current branch that adds `design/` and removes `spool.json`, with the message `design: moved out of Spool Cloud`, and never pushes.
- **Delete your account** at the foot of spool.page/account. The confirm says what happens and names every team affected, and you confirm by typing your email. It is refused while you are the last admin of a team with other members, and names those teams. Teams where you are the only member are deleted with it, each in the normal way (30 days, then purged; a paying one's subscription ends at once). If a team's billing email is yours, it moves to the team's longest-standing other admin, who is told. Your account goes at once.
- **Former member.** Wherever a team's history names who saved something, a deleted account's saves are kept and shown as Former member.
- **Team export.** An admin exports a team project, or the whole team, from the Mac app into a folder. Each project becomes a git repository: its current `design/` plus its team history as commits, each authored by the member who saved it. A team file lists members, roles and shares. On spool.page, Export opens the Mac app, or offers the download when it's missing. Admins can still export after a team ends: until it is purged, 30 days after a delete and 6 months after a lapse.

## User Stories

1. As an admin, I want a project I remove from the team to wait 30 days in a trash, so that a misclick doesn't cost the team its shares and comments.
2. As an admin, I want the remove sheet to say what ends ("4 people stop syncing, 2 shares pause, 12 comments") and that it can be restored for 30 days, so that I know what I'm doing before I confirm.
3. As an admin, I want removing a project to need no typed name, so that the trash, not friction, is the safety net.
4. As an admin, I want a Removed list on the team's Projects page, saying who removed each project, when, and how many days it has left, so that I can find what's in the trash.
5. As an admin, I want to restore a removed project from the Mac app or spool.page, so that whoever notices the mistake can undo it from wherever they are.
6. As an admin, I want a restored project to come back with its files, history, set-aside saves, comments, covers and shares as they were, so that a restore is a true undo.
7. As an admin, I want **Delete now** on a removed project, after a confirm, to purge its files, team history, set-aside saves, comments, compiled frames and covers at once, so that I can get rid of something that must not be kept.
8. As an admin, I want a removed project purged by itself 30 days after it was removed, so that the data the team let go of is actually deleted.
9. As an admin, I want a removed project's name to stay reserved while it is in the trash, so that a restore never collides with a new project of the same name.
10. As an admin moving a project into the team, I want a name held by the trash refused with the date it frees up, so that I know why and when.
11. As an outsider with a share of a removed project, I want the stopped-share page while it's in the trash, and my access back if it's restored, so that a removal pauses rather than ends what I was shown.
12. As a member, I want my copy of a removed project to stop syncing and stay on my Mac as an ordinary project, as today, so that removal never deletes anyone's files.
13. As a member, I want the notice on my copy to say who removed the project from which team, so that I know whom to ask.
14. As a member whose daemon was offline when the project was removed, I want to be told "removed from <team>" the next time it connects, not "not a member", so that the reason is right.
15. As a member, I want a restored project to appear on Home again with Get it, so that I can carry on with it.
16. As a member whose checkout already had `design/` put back in git before the restore, I want Get it to make the commit that takes `design/` out of git and puts `spool.json` back, so that my copy rejoins the team instead of waiting for a commit that will never come.
17. As an admin of a project moved out of the team, I want the moved-out project in the trash too, so that "Move out of <team>" and removing are one way out with one safety net.
18. As a member whose copy ended (the project removed, me removed or made a viewer, the team deleted) in a checkout, I want **Put design/ back in git** on its notice and its cover menu, so that one click makes it an ordinary project in git again.
19. As a member whose team went local, I want the same Put design/ back in git, so that we can stop depending on Spool Cloud without waiting for someone else.
20. As a member, I want Put design/ back in git to make exactly one commit on my current branch, add `design/`, remove `spool.json`, run no hooks, wait out a merge or rebase, and never push, so that it behaves like the move in did.
21. As a teammate who makes the same commit on my own machine, I want identical files to merge cleanly when I pull someone else's, so that two of us doing it never conflicts on files that didn't differ.
22. As a member whose team went local, I want Put design/ back in git to also end my copy, so that it doesn't start syncing again if the team pays later.
23. As a member whose copy waits for the admin's move-out commit, I want the existing "pull its repo" notice rather than a second commit, so that I don't make a commit that conflicts with the one coming.
24. As a person, I want **Delete account** at the foot of spool.page/account, so that I can leave without writing to anyone.
25. As a person deleting my account, I want the confirm to say that my teams keep my work, my Macs stop syncing, and their folders stay as ordinary local projects, so that I know nothing on my disk goes.
26. As a person deleting my account, I want to confirm by typing my email, so that it can't happen by accident.
27. As the last admin of a team with other members, I want deletion refused, naming the team and saying to make someone else admin first, so that no team is left without an admin.
28. As the only member of a team, I want that team named in the same confirm and deleted with my account, so that I don't have to delete it first.
29. As the only member of a paying team, I want its subscription to end at once when my account is deleted, refunded in full if it's within 14 days of the first payment, so that I'm not charged for a team that is gone.
30. As a person deleting my account, I want it gone at once, with my sessions, passkeys, Macs, memberships and solo projects, so that "delete" means delete.
31. As a person who signs in again after deleting my account, I want a fresh, empty account, still reached by any open invite or people share naming my address, so that coming back works.
32. As an admin of a team whose billing email was a deleted member's address, I want it moved to me if I'm the longest-standing other admin, and to be told by email, so that invoices keep reaching someone.
33. As a team whose billing email is a finance@ address, I want it left alone when a member deletes their account, so that our books don't move.
34. As a member, I want a deleted person's saves kept and shown as **Former member** in the team's history, so that the record of who changed what stays whole without keeping their name.
35. As a member on the phone navigator, I want recent frames saved by a deleted account to stay in the list as Former member, so that recent doesn't silently drop work.
36. As a person, I want my account page to list my email, teams, Macs and passkeys, so that I can see what Spool Cloud holds about me before I ask privacy@spool.page for more.
37. As an admin, I want **Export…** on a team project's menu in the Mac app, so that I can take one project out as a git repository.
38. As an admin, I want **Export all** in the team's Settings in the Mac app, so that I can take the whole team out at once.
39. As an admin, I want each exported project to be a git repository holding `design/` as it stands now, with the team history as commits, one per applied save, authored by the member who made it and dated when it was made, so that the history survives outside Spool Cloud in a format every tool reads.
40. As an admin, I want a deleted member's commits authored as Former member, so that the export keeps no name the team no longer has.
41. As an admin, I want a team file beside the repositories listing members (name, email, role, joined), and shares (project, pages, who or link, made when), so that the team's shape survives too.
42. As an admin, I want the export written straight to a folder I pick, with progress and a way to cancel, so that a 1 GB project needs no zip and no download link.
43. As an admin on spool.page, I want Export to open the Mac app on the export, or offer the download when the app isn't installed, so that the browser leads me to where the files are.
44. As an editor or viewer, I want no Export, so that a team's whole history leaves only through its admins.
45. As an admin of a deleted team, I want to still export until it is purged 30 days after the delete, and to see that date, so that a delete is never the end of our data.
46. As an admin of a lapsed team, I want to still export until it is purged 6 months after the lapse, so that not paying never traps our work.
47. As an admin deleting a team, I want the confirm to say we can still export until the purge date, so that I know the way out before I press.
48. As an agent, I want `spool move --out` to say the project waits 30 days in the team's trash, so that what I tell my person is true.

## Implementation Decisions

**A removed project (spool-cloud).**
- Removing becomes a soft delete. A team project gains when it was removed, by whom, and when it is purged. The row stays, so `UNIQUE(team_id, name)` holds the name, and shares (which cascade from the row) survive. Every read of a team's live projects (listing, the project at an address, sync and canvas access, share access, comment emails, moves, the compile object's live feed) excludes removed ones through one shared "live project" condition, not a filter repeated by hand.
- The one remove operation serves both today's doors, the plain remove and `?out=1`. It records the remover, keeps comments and the compile object (compiled frames and covers), tells the sync object to close every connection with the new standing, and still writes the moved-out marker for a move out.
- The project's standing for a daemon or browser that asks becomes `removed`, carrying the team's name, the remover's name and when. It's answered on connect, on the standing read, and to a `spool.json` naming the project, never `not a member`.
- Shares of a removed project answer with the stopped-share page, as a lapsed team's do, and resume on restore. Each share's own state (stopped or not) is untouched by the trash.
- **Restore** (admin, any of the team's): clears the removal and tells the sync object the project's standing changed. It is refused while the team has no paid time left, as a move in is (Open question 5). The name is still the project's, so nothing can clash.
- **Delete now** (admin) and the **purge** (the scheduled run, idempotent, taking `now`, on the same cron as the team purge) both: forget the sync object (files, history, set-aside saves, comments, held emails) and the compile object (compiled frames, covers), then delete the row with its shares, forwards and moved-out marker. A failure to clear an object keeps the row and is retried on the next run, as the team purge does. The team purge already selects every project row of a team and so covers projects in its trash.
- Routes on the team's API: the team's removed projects (admins only), restore, delete now. The project list's existing route stays live-only.
- Moving a project into the team, or a team move, under a name held by the trash is refused with that reason and the purge date.

**A removed project (spool).**
- The Projects page (Mac app and spool.page, which share the team screens) gains a **Removed** section for admins: name, "Removed by Ana · 23 days left", Restore, Delete now (with a confirm). Editors and viewers don't see it.
- The move-out sheet says shares pause and the project can be restored for 30 days. It counts shares beside editors and comments ("its 12 comments are kept with it"), and drops "comments are deleted".
- The daemon reads `removed` as an end of the copy (today's `endLocalCopy`). The notice and the copy's record carry who removed it: "Ana removed tidemark-app from Tidemark. It's now a project on this Mac only." A moved-out copy keeps today's "pull its repo" notice.
- After a restore, the project shows on Home like any team project not on this Mac. Get it on a folder holding an ended copy of it resumes that copy (today's `resumeLocalCopy`). Where `design/` was put back in git and `spool.json` is gone, Get it makes the move-in commit again (the `commitPaths` machinery), not waiting for one.
- `spool move --out` and the skill text say the project waits 30 days in the team's trash.

**Put design/ back in git (spool only).**
- Offered on a copy that ended or went local and sits in a checkout whose branch still tracks `spool.json`. It isn't offered on a copy marked moved out (its commit is coming by pull) or on a copy in no repo.
- One commit through the existing `commitPaths` (scratch index, no hooks, no signing, waits out a merge or rebase, current branch, never pushes): adds `design/` as it is on disk, removes `spool.json`, message `design: moved out of Spool Cloud`. The solo `.gitignore` replaces the team's `*` before the commit. A gone-local copy is ended first, so it never follows the team again.
- App only, no CLI verb (#100). Shown as an action on the copy's sync notice and as a cover-menu item.

**Deleting an account (spool-cloud).**
- One account-deletion operation, used by both the maintainer route and the new self-serve route. It does what the maintainer route does today: sessions, passkeys, link sessions, memberships, solo projects and their compile objects, Macs told at once, and comments re-told. To that it adds:
  - **Sole-member teams.** Every team where the account is the only member is deleted through the existing team delete, before the account goes. This is the 30-day purge, and for a paying team the cancel owed to Stripe, which refunds within 14 days of the first payment. The last-admin refusal then applies only to teams with other members, and names them.
  - **Billing email.** For each remaining team whose Stripe customer email equals the account's address, the customer's email moves to the team's other admin with the earliest `joined_at`, and that admin gets one email saying so. The Stripe port gains one method to set a customer's email (real and fake). A Stripe failure is logged and doesn't block the deletion. The team's Billing shows the email Stripe holds.
- Self-serve: `/account` lists email, teams (name and role), Macs and passkeys, and ends with Delete account. Its confirm page names the teams that would be deleted and any that block it. A POST deletes only when the typed email matches the account's exactly; otherwise it re-renders with the reason. After deleting, the browser session is gone and the page says the account was deleted. Web only: the Mac app's account view links to spool.page/account and has no delete of its own.

**Former member.**
- Saves in a sync object keep their account id. Whoever reads the team's history names an account id with no account as **Former member**, with no name or email kept. The navigator's recent list shows such saves as Former member instead of dropping them. The export and the History pane (#114) use the same naming. Comments keep their shipped "Deleted account" until Open question 3 is settled.

**Team export.**
- **spool-cloud:** an admin-only, paged read of a team project's history: each applied save in order (version, path, content hash or deleted, account, time, bundle), the authors' names and emails as the team's People page shows them (Former member for none), and the blobs by hash, in answers sized as the catch-up's blob answers are. It also offers the current files' list, and a team read of members (name, email, role, joined) and shares (project, pages, people's addresses or the link's host, made, made by). These answer for a live, lapsed (until its purge) or deleted (until its `purge_after`) team, and to admins only. Nothing else answers for a deleted team.
- **spool (daemon):** an export job writes, under a folder the admin picks, `<team address> export <date>/` holding `team.json` and one git repository per project. Each repository is built with `git fast-import` from the paged history: one commit per applied save (a bundle, such as a move in, is one commit: Open question 4), author `Name <email>` or `Former member <>`, the save's time, message naming the path. The tree holds `design/` as the save left it. A final check compares the last commit's tree with the team's current files. Files whose last save predates the kept history (once #114 prunes at 90 days) go into a first commit, "design/ as Spool Cloud held it on <date>". A project's export is the same job for one project, with `team.json`. Progress and cancel reuse the project transfer's busy and cancel pattern. Git missing on the Mac is said, not crashed on.
- **spool (UI):** "Export…" on a team project's cover menu, for admins. The local "Export project…" (`.spool` archive) stays for every project. "Export all" in team Settings › General, for admins. In the browser, Export opens the Mac app on that export through the existing Open in spool path, or offers the download when the app is missing. A deleted team stays in its admins' switcher until its purge, marked "Deleted · gone on <date>". It opens to one page with Export all and nothing else (Open question 2). The Delete team confirm adds "Admins can export it until <date>."

**Glossary.** spool-cloud's GLOSSARY.md gains **Removed project**, **Former member**, **Team export** and the deleting sentence of **Account**, taken from the unmerged branches `118-wayfinder-dev-251` and `119-wayfinder-dev-252`. Only those entries come over, not their stale invite-only wording. spool's GLOSSARY.md **Local copy** says a removed project's copy ends with who removed it, and gains Put design/ back in git.

## Testing Decisions

- A good test drives the product through its outermost seam and asserts what a person or a daemon would observe: HTTP answers, standing, rows gone or kept, emails sent, files and commits on disk. It never asserts which helper ran.
- **spool-cloud: the worker's routes, in the Workers test pool,** with `now` injected and the fake Stripe port. One seam for the trash (remove, list, restore, delete now, purge, name refused, shares paused and resumed, standing `removed`), account deletion (self-serve and maintainer doors, sole-member teams deleted and their subscription cancelled, last-admin refusal naming teams, billing email moved and told, Former member in recent) and the export reads (admin only; live, lapsed, deleted until purge; pages complete). Prior art: `src/worker/sync/moves.worker.test.ts`, `src/worker/teams/app.worker.test.ts`, `src/worker/billing/endings.worker.test.ts`, `src/worker/auth/account-app.worker.test.ts`. Stripe is never called.
- **spool: the daemon against a fake spool.page, and real git in a scratch repo,** for the copy's end with who removed it, Get it after a restore (with and without `design/` back in git), Put design/ back in git (one commit, right paths, hooks not run, waits out a rebase, two machines' identical commits merge cleanly), and the export (a scratch team's history becomes the expected commits, authors, Former member and final tree). Prior art: `src/daemon/team-moves.test.ts`, `src/daemon/team-moved.test.ts`, `src/daemon/team-sync.test.ts`, `src/daemon/project-transfer.test.ts`.
- **spool: UI as rendered markup** for the Removed section, the remove sheet's words, the notice's action and the export menu items by role. Prior art: `src/ui/team-move-out.test.ts`, `src/ui/team-lapsed.test.ts`, `src/ui/project-transfer.test.ts`.

## Out of Scope

- Moving a project to another team, out of a team, or into a checkout (`spool move`): shipped (#135).
- Billing, the trial, lapsing and the 14-day refund: shipped (#122 and children). A deleted paying team's cancel and refund from Settings ships. This spec only reaches it from account deletion.
- Deleting a lapsed team's cloud copy after 6 months unpaid, with emails first: a follow-up once a team can be 6 months lapsed (#122). The export's 6-month window holds until that purge exists.
- The History pane, Compare, restore from history, `spool history`, pruning history at 90 days and the daily R2 backups (#114). The export reads whatever history the sync object holds.
- Restoring a deleted team, and an undo for account deletion: not decided, and deliberately absent.
- A person's own data export (GDPR access and portability): by request to privacy@spool.page, answered by hand.
- The privacy notice's and terms' wording on retention and on the export as the Data Act's "exportable data" (#118, #93).

## Further Notes

Audit of what ships today (spool on main b9089592, spool-cloud on main 5c36bcf):

- **Remove from team: partly shipped.** It ships as "Move out of <team>" (spool `src/ui/team-moves.tsx` MoveOutSheet, `src/move-verb.ts` `spool move --out`, commit via `commitPaths` in `src/daemon/history.ts`; spool-cloud `DELETE /api/teams/:team/projects/:project` in `src/worker/sync/app.ts`), admins only. It only appears on a cover with a copy on this Mac, or in the CLI. The sheet names editors and counts comments, but not shares.
- **The 30-day trash: missing.** `removeProject` (`src/worker/sync/projects.ts`) deletes the row. Shares cascade (`migrations/auth/0013_shares.sql`). Comments and the compile object are forgotten at once. The sync object is never purged (it leaks), and there is no Restore or Delete now.
- **Teammates' copies kept: shipped** (`endLocalCopy`, `src/daemon/team-sync.ts`). The notice doesn't name who removed it, and a plain removal reads as gone, not "removed from".
- **Put design/ back in git: partly shipped.** Only the mover's commit exists, and teammates get it by pull (`markMovedOut`, `settleMovedOut`). There is no action for a gone-local or otherwise ended copy (#122 handed it here).
- **A deleted team and its purge: shipped** (`deleteTeam`, `purgeTeams` in `src/worker/teams/operations.ts`, cron in `src/worker/index.ts`). **A deleted paying team: shipped** (`oweCancel`, `cancelOwed` with the 14-day refund in `src/worker/billing/operations.ts`; confirm in spool `src/ui/teams.tsx`).
- **Account deletion: partly shipped.** The maintainer route `DELETE /internal/accounts/:email` (`src/worker/auth/maintenance-app.ts`) deletes, cuts Macs (`accountStandingChanging`) and re-tells comments as "Deleted account" (`src/worker/sync/comments.ts`). Missing: the self-serve door on `/account` (`src/worker/auth/account-app.ts`, `account-pages.ts`, which also lists no teams), sole-member teams (refused as last admin today), and the billing email handover (the Stripe port can't set a customer's email).
- **Former member: missing.** `namedRecent` (`src/worker/frames/canvas-app.ts`) drops a deleted account's saves, and there's no history UI yet (#114).
- **Team export: missing.** "Export project…" (spool `src/ui/project-transfer.tsx`, `src/daemon/project-transfer.ts`) is a local `.spool` archive. The sync object's saves log and blobs (`src/worker/sync/object.ts`) have no read route.
- **Glossary:** Removed project, Former member, Team export and Account's deleting sentence sit on the unmerged spool-cloud branches `118-wayfinder-dev-251` and `119-wayfinder-dev-252`.

Not code, for Liam: privacy@spool.page has to exist and forward to Cata. The privacy notice must say live data goes at once, backups roll off within 30 days and invoices stay 7 years. The terms must name the export's contents (#118, with the lawyer per #93).

## Open questions

1. **Comments in the trash.** #100 predates comments, and today's move-out deletes them at once (the sheet says so). *Recommendation:* they go to the trash with the project, come back on restore and are purged with it. That's what this spec assumes.
2. **Where a deleted team's admins export from** during its 30 days. *Recommendation:* the team stays in its admins' switcher, marked "Deleted · gone on <date>", opening to one page with Export all. That's what this spec assumes.
3. **"Former member" or "Deleted account" on comments.** Comments ship "Deleted account", and outsiders read them too. *Recommendation:* keep "Deleted account" on comments, and use Former member only in team history and the export.
4. **One commit per save or per bundle.** #101 says one per applied save. A move in is one bundle of up to thousands of saves. *Recommendation:* one commit per bundle and one per lone save, so a move in is one commit.
5. **Restoring into a lapsed team.** *Recommendation:* refuse it with the lapsed reason, as a move in is refused (#135). It can be restored once the team pays, if still inside its 30 days.
6. **A second trial after deleting the account.** `trial_used_at` lives on the account, so deleting and signing up again gives the same address a fresh trial. *Recommendation:* keep a one-way digest of each address that spent a trial and check it when a team is created. Say so in the privacy notice.

Related: #122, #101, #100, #89

Plane: SPOOL-116

## Comments

### agent, 2026-10-21T16:54:21.986Z

Spec written and cut into build tickets (agent-hub task 205): #197 a removed project waits 30 days in the trash; #198 put design/ back in git from a copy that ended or went local; #199 delete your own account, and Former member; #200 a team export as git repositories (blocked by #199). The audit of what already ships is in the spec's Further Notes; six open questions with recommendations are at its end.

### agent, 2026-10-21T19:58:10.146Z

All four children built and merged (spool a963331e, spool-cloud f7dc00e) and closed: #197, #198, #199, #200. Open question 6 (trial-reuse digest) stays undecided; nothing built for it.
