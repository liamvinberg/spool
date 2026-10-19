# #89 · Wayfinder map: Spool Cloud public launch

- State: closed
- Labels: wayfinder:map
- Created: 2026-10-18T17:43:56.179Z
- Updated: 2026-10-18T17:43:59.804Z
- Closed: 2026-10-18T17:43:59.804Z

## Destination

Anyone can go from [spool.page](http://spool.page) to a paid team working on a live canvas without us in the loop, and Spool Cloud is safe to take money for. The map is done when every decision for that is made and the build is ticketed.

## Notes

- Builds on Wayfinder map: Spool Cloud for teams (#3), whose first version is live for Devosurf since [spool.page](http://spool.page) 0.31.0. Its specs and decisions are the floor: start from them, don't re-derive. Spec: accounts, teams, roles, invites and billing (#64) and Billing (#70) (deferred; a Stripe test key is in place, see that ticket) are where billing starts.
- The launch-readiness read of 2026-10-09 (agent-hub task 97): the move into a team is held by the 120 saves a minute limit; team canvases have no backups; history is never pruned; the sign-in email budget is 100 a day; there is no billing code; team creation is behind a maintainer flag.
- Everything here is private: Linear only, never public GitHub. Only implementation-ready work about the published product goes to public issues, decided before posting.
- Research lands in `spool-cloud/research/` as numbered folders, numbered by ticket. Prototypes are spool frames in the spool repo's `design/` (a team project, run `pnpm dev skill` first): cloud screens under `design/frames/explore/cloud/`, the landing under `design/frames/landing-site/`.
- Wayfinder map: Spool Cloud for teams (#3) closed on 2026-10-11 (agent-hub task 123): its specs are built. Its two open decisions moved here; Billing (#70) is rewritten by Spec: buying and paying for a team (#112). Build tickets live outside the map, with no parent.
- Skills: grilling and domain-modeling for decisions; research for research; prototype and the designer agent for prototypes. Cata speaks for the product with Liam.

## Decisions so far

- Decide what Spool Cloud costs and what stays free (#90): paid only. Every editor is a seat at $20 a month or $16 yearly (USD), with a 14-day trial for up to 10 editors, no card (kept in #98 over #99's card). Viewers and outsiders are free on a paid team and nothing hosted is free otherwise. No editor cap on paid teams. A lapsed team goes local. Sold for businesses, but anyone can pay.
- Decide what launches first (#91): teams only, sold from day one; team creation opens in the same release that takes payment, and stays behind the maintainer flag until then.
- Research: running Spool Cloud for paying customers on Cloudflare (#94): capacity is fine at 100 teams and mostly at 1,000. Before taking money: R2 snapshots with restore, Resend Pro, Turnstile and a WAF rule, six alerts, a chunked new-editor catch-up, and CI.
- Research: the paperwork for selling software to businesses (#93): sell to businesses only, with six public pages (B2B terms, a product privacy notice naming Mojo AB, a click-through DPA, subprocessors, company details, abuse contact). A lawyer reviews the terms, the DPA and DSA/Data Act scope.
- Research: selling Spool Cloud from Mojo AB (#92): plain Stripe on Mojo AB stays cheapest (about 5–7% on a $20 seat), with Paddle as the fallback if the tax work is too heavy, and no Managed Payments. Mojo AB's VAT status is settled with the accountant before the first live charge (16 questions in the report).
- Decide how a big project gets into Spool Cloud: bulk upload and the save limits (#83): moving in counts against no limit (empty project only, size caps still apply); the minute limit becomes a bucket of 2,000 refilling at 120 a minute; the month still counts saves, 30,000 per editor per project.
- Decide history and restore for team projects (#57): an editor restores a file, frame, page or the whole project to a moment, as ordinary new saves. Every save is kept 90 days in the team history, our own log rather than git. People use it in the app, agents through one read-only `spool history` command. Daily R2 backups, kept 30 days, are separate.
- Load-test a busy team project (#103): one project holds about 30 people all moving their pointers (keep people moving × people under \~1,000); past that Cloudflare drops every moving person's socket, sync included. 120 saves a minute holds about 80 busy agents. A 990 MB catch-up works (21 s) but blocks the object for seconds and drops everyone moving.
- Decide what happens to the beta's publications and links (#59): every beta publication ends, nothing moves to teams. All 11 were Cata's, in the beta environment; the 3 still live were stopped on 2026-10-10 and every link answers 410. The beta's data, glossary words and `spool cloud` publication verbs go with the exporter.
- Decide how a broken sync is noticed and fixed, and members on different Spool versions (#58): every connect checks a fingerprint of the team's copy and repairs drift silently. A dead line is noticed by a ping timeout. "Offline" shows after 30 s, and Match the team is in the project menu. An older Spool pauses with an update prompt, and the first member to update moves the team's format. Alerts go to a Discord alerts channel under Spool. A restore from backup brings newer work back from members' Macs.
- Prototype getting a team project onto a Mac that already has design/ (#96): Get it compares a never-synced design/ with the team's and its history: older files take the team's, files only here go up, and only edits that would overwrite a teammate's file are set aside. A pre-move branch waits for the merge; another project is refused. Someone outside the team sees a cover and a sheet naming who moved it (from git) and who to ask. Get it also finds clones in the usual code folders, never Desktop, Documents or Downloads.
- Prototype Home once you're in Spool Cloud (#97): a sidebar listing every team in a fixed order, then Your projects. The team you're in opens to its pages, with motion. The address holds the place (`/<team>`, same as [spool.page](http://spool.page)), and the next launch opens where you last were. A viewer team is a place too, and its projects open in the browser. New project goes where you are. Below 720 px the sidebar becomes a column of icons.
- Prototype the landing page (#95): the "chapters" page, dark full-screen scenes that auto-play (agent switcher building Sova, Fair, Sola, Stilla, Gust for Cloud), "A canvas your agent draws on.", a Cloud waitlist with email confirmation, no prices yet.
- Prototype sharing a whole project with someone outside the team (#102): today's share sheet gains a What choice (Pages or Whole project: every page, and pages added later) and an optional end date. It opens from a page's Share… or the Shared control's Share the whole project…. The outsider sees today's read-only canvas, each page as it settled. It stops on its end date or with Stop sharing. Frames already compile with every shared/ file they import, and a design-system save re-settles the pages that render it.
- Decide how seats and billing are run (#99): seats are editors, added only by admins, prorated both ways (credits never refunded). (Its trial card was overturned by Prototype pricing and buying a team (#98): no card.) Failing cards warn admins only; cancel runs to period end, with a full refund within 14 days of the first payment. Stripe's portal holds card, invoices, VAT ID, plan switch and cancel; Settings shows a thin admin-only Billing section.
- Prototype pricing and buying a team (#98): the hero gets a line pointing to pricing (PostHog measures it), and the Cloud chapter shows spool free beside Spool Cloud, with the team named right there. No-card trial, one per account. One setup list (name, invite, get the app, move a project in) is the same on [spool.page](http://spool.page) and in the app, and the app carries on where the web stopped. [spool.page/](http://spool.page/) becomes Home without the Mac tabs. Settings gets General and Billing tabs, and the trial shows only on Billing. People shows the seat count and an editor's cost before inviting. Roles stay Admin, Editor, Viewer, with no owner.
- Decide what one busy project must hold at launch (#106): presence goes same-page, batched, at most 50 cursors a page, and never closes a socket (bar: 100 people at once). Catch-up goes in chunks, reconnects spread out. Saves stay 120 a minute with the 2,000 bucket, paced instead of refused. 1 GB and 25 MB stay; agents hear when a file didn't sync, and the docs list the limits.
- Decide how a project leaves a team (#100): one action, Remove from team, admins only. The cloud copy goes to a 30-day trash with restore and Delete now. Local copies are never deleted. Put design/ back in git is an app action on each machine. No moving between teams at launch.
- Decide deleting an account and taking your data with you (#101): self-serve at [spool.page/account](http://spool.page/account), at once, typing your email; sole-member teams go with it, other teams need another admin first. History shows a Former member. Admins export a project as git (files and 90 days of history) plus a team file, in the Mac app, until the purge. A deleted paying team ends at once without refund past 14 days. Personal data on request to privacy@.
- Prototype team history and restore in the app (#105): a History pane beside Properties and Agent, opened from a frame's menu or the project's. Saves are grouped in stretches on a paced spine (spacing is time), filtered by person. Compare stands the old version beside now on the canvas. Restore goes to a stretch's end, and a shared import is offered, off by default.
- Spec: buying and paying for a team (#112): written as Spec: paying for a team: trial, seats and billing (#122), six tickets. No-card trial, Stripe behind an injected port, a lapsed team's copies stop without ending and reconnect on payment. Tax runs on common practice instead of an accountant (in its Further Notes).

## Not yet specified

- Launch day: how and when it's announced (research 89-distribution has drafts and venues). Waits on the build being near done and on what the landing and first hour become.

## Out of scope

- An organisation over several teams, SSO, audit logs: Idea: an organisation over several teams (#46).
- Free Spool Cloud features beyond shares (Cata has some in mind for later).
- Comments, a canvas of main, the canvas on a phone, editors requesting a seat: they stay ideas on the earlier map.
- Agents running on Spool's servers.
- Media over 25 MB a file (Figma takes 100 MB videos), stored outside the sync object: after launch, if customers ask. Ruled in Decide what one busy project must hold at launch (#106).

*From Linear DEV-240.*

Related: #111, #113, #114, #115, #116, #117, #118, #119, #120, #121, #122, #84, #70, #65, #64, #60, #46, #3

Plane: SPOOL-89

## Comments

### agent, 2026-10-18T17:43:59.794Z

**Liam, 2026-10-14:** Closing the map (agent-hub task 152). Every decision it set out to make is made, and what it led to has shipped: team creation is open to everyone and production bills in live Stripe mode (Spec: paying for a team: trial, seats and billing (#122), done).

What was still open under the map now stands on its own, with no parent:

**Specs to write with to-spec, then ticket (ready-for-agent):**
- Spec: Home and Get it for Spool Cloud (#113)
- Spec: team history, restore and backups (#114)
- Spec: sharing a whole project (#115)
- Spec: a project leaves a team, and deleting an account (#116)
- Spec: running Spool Cloud for paying teams (#117)
- Spec: the landing page, pricing and the legal pages (#118)

**Decisions still to make with Cata:**
- Decide whether Spool Cloud launches Mac only (#111)
- Decide a new team's first hour (#119)
- Decide support for paying teams and a status page (#120)
- Decide what we measure from launch (#121)

**Parked as ideas** (leftovers from Wayfinder map: Spool Cloud for teams (#3)):
- Idea: tell a member when something in the team changed (#60)
- Idea: an agent may move a project into a team (a CLI verb) (#84)

Launch day (the one patch of Not yet specified) is dropped: Spool Cloud is already selling.

Why the map ran long: its Destination said it was done when "the build is ticketed", so the specs were hung under it as children. A map holds decisions only; specs are the handoff after it. spool's docs/agents/issue-tracker.md now says so in a Wayfinding operations section.
