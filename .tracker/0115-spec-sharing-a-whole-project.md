# #115 · Spec: sharing a whole project

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.484Z
- Updated: 2026-10-21T19:14:02.223Z
- Closed: 2026-10-21T19:14:02.223Z

## Problem Statement

A share today is some of a project's pages, picked one by one. Cata wants to hand a whole project, read-only, to a client or a developer outside the team, and have it keep up as the project grows: today every page added later has to be ticked into a share by hand, and a share of 100 pages is the most one can hold. A share also has no end: it runs until someone remembers to press Stop sharing, and once stopped its address says only "This page isn't here" or "This link doesn't open anything any more", so the outsider can't tell a share that stopped from a wrong link, nor whom to ask.

## Solution

A whole project is one more thing today's share surface shares, decided in Prototype sharing a whole project with someone outside the team (#102). The Share popover at the bar's end (which replaced the share sheet #102 drew on) gains a **What** choice, *Pages* (today's page tree) or *Whole project* ("Every page, and pages added later"), and an **Ends** choice in its foot: Never, In 30 days or In 7 days. It opens from a page's right-click *Share…*, on that page, as today, and from *Share the whole project…* at the foot of its list of shares, with Whole project picked.

The outsider sees today's read-only canvas with every page of the project in its rail, each as it settled, the design system's own pages among them. A page added later joins the share once it settles, and is marked unseen in their rail. A phone gets today's shared-link player. A save to `shared/` already re-settles every shared page whose frames render it, so a design-system change reaches the outsider at that page's next settle.

A share stops by itself on its end date, or at once with Stop sharing. The Shared control's rows say "whole project", and "ends 9 Nov" under a share that has an end. Once it has stopped, its address answers with an empty state naming who stopped it, or the day it ended, and whom to ask.

## User Stories

1. As an editor, I want to share the whole project in one step, so that I don't tick every page.
2. As an editor, I want a whole-project share to include pages added after I made it, so that the client keeps up without me.
3. As an editor, I want a page deleted or moved out of the project to leave a whole-project share, so that nothing stale lingers for the outsider.
4. As an editor, I want the What choice beside today's Who choice in the Share popover, so that sharing stays one surface.
5. As an editor, I want the page tree shown only when Pages is picked, so that Whole project reads as simple as it is.
6. As an editor, I want Whole project to say "Every page, and pages added later", so that I know exactly what I'm giving away.
7. As an editor, I want a page's right-click Share… to open on that page with Pages picked, as today, so that the quick path is unchanged.
8. As an editor, I want a Share the whole project… item at the foot of the Share popover's list of shares, so that I can reach Whole project directly.
9. As an editor, I want a whole-project share to work with Named people and with Anyone with the link, so that both audiences are served.
10. As an editor, I want a whole-project share to open on the frame I hold when I share, as a pages share can, so that the client lands where I mean.
11. As an editor, I want the people a whole-project share names to be emailed a link that says it is the whole project, so that they know what they're opening.
12. As an editor, I want no 100-page cap on a whole-project share, so that a big project can be shared whole.
13. As an editor, I want to choose when a share ends: never, in 30 days or in 7 days, so that access to a client's review closes by itself.
14. As an editor, I want the Ends choice to show the date it means beside each option, so that I know the day it stops.
15. As an editor, I want Never to be the default end, so that sharing behaves as it does today unless I choose otherwise.
16. As an editor, I want an end date on a pages share as well as a whole-project one, so that both kinds can expire.
17. As a member, I want a share's row in the Shared control to say "whole project" instead of a page list, so that I can tell the kinds apart.
18. As a member, I want a share that ends to show "ends 9 Nov" in its row, so that I know how long it runs.
19. As a member, I want an ended share to leave the Shared control by itself, so that the list shows only what is live.
20. As an editor or admin, I want Stop sharing to end a whole-project share at once, as any share, so that I can take it back the moment I need to.
21. As an outsider, I want to see the project's read-only canvas with every page in its rail, so that I can find my way around it.
22. As an outsider, I want each page as it last settled, so that I never see someone's half-made work.
23. As an outsider, I want the project's design-system pages in the share, so that I can see the components and tokens too.
24. As an outsider, I want a page added after I last looked marked unseen in the rail, so that I spot what's new.
25. As an outsider, I want the unseen mark gone once I've opened that page, so that it says only what I haven't seen.
26. As an outsider, I want a design-system change to reach the pages that render it at their next settle, so that what I see is consistent.
27. As an outsider, I want the line at the foot of the canvas to say who shared the project with me, so that I know whose it is.
28. As an outsider on a phone, I want today's shared-link player for a whole-project share, so that it works where I open it.
29. As an outsider, I want to comment on any page of a whole-project share, so that my feedback can go anywhere in the project.
30. As an outsider, I want a stopped share's address to say who stopped sharing it, so that I know it wasn't a broken link.
31. As an outsider, I want an ended share's address to say the day it ended, so that I know it ran out rather than was taken back.
32. As an outsider, I want either empty state to say whom to ask, so that I can get it back if I still need it.
33. As someone never named on a people share, I want its address to answer as it does today, so that it tells me nothing about the project.
34. As a member, I want a share's address to keep sending me to the team's canvas, stopped or not, so that I'm never treated as an outsider.
35. As an outsider of a lapsed team's share, I want to keep seeing "This share has stopped", so that a team's billing is never told as someone stopping it.
36. As an editor, I want an ended share's comments to close for its outsiders exactly as a stopped share's do, so that ending is a real end.
37. As an editor of a solo project, I want to share my whole project with a link, so that I don't need a team to hand a client everything.
38. As a member on an older spool, I want a whole-project share to still show sensibly in my Shared control, so that a mixed team isn't broken.

## Implementation Decisions

**A share's What.** A share is either some pages or the whole project. The whole project is stored as "every page", never as a list: the share carries the fact, and every place that asks which pages a share shows (its frames, covers, canvas, comments, invite email, Shared control rows) resolves it against the project as it stands. One predicate, *what a share shows*, answers for a frame or a page and is the only place the two kinds differ; today's "pages includes this frame's page" checks all go through it.

**Settling pages added later.** The compile object, which already keeps its own copy of the team's files and settles shared pages, resolves a whole-project share against that copy whenever it catches up: a page that appears settles for the share as it stands and joins its canvas; a page that goes leaves it with what it settled. #102 put this on the Worker telling the compile object again; doing it where the files are needs no new call and no Worker round trip, and pages shares keep today's trigger (the Worker tells it when a share changes).

**Comments.** An outsider's comments socket on a whole-project share hears every page's comments of that share's audience, and may post on any page, resolved the same way; the sync object's assumption that a share's pages never change after it is made no longer holds for whole-project shares.

**Ends.** A share gains an optional end moment, chosen as Never, In 30 days or In 7 days from the moment it is made. A share past its end is not live at the moment of asking, everywhere a share is asked for (people page, link host, frames, covers, scenarios, comments), so ending needs no sweep to be exact. The five-minute scheduled run gains one job that finds shares past their end and lets go of them as a stop does: the compile object is told (it drops what it settled and compiled for them), and their comments sockets close. An ended share is told apart from a stopped one in storage (its end, not a stopper), and both leave the Shared control. The end can't be changed after sharing; see Open questions.

**The Share popover (spool).** The bar's Share popover's new-share view gains What (two choices; the page tree and its "Shares … · Change" row only under Pages) and, in its foot beside Share, the Ends choice as a quiet menu with each option's date. Opened by a page's right-click it starts on Pages with that page; *Share the whole project…* at the foot of its list of shares starts it on Whole project. Under Whole project, the size line says the project's page and frame count, and "Start on <frame>" stays offered for any held frame. The share's opened detail and the browser's Shared control rows say "whole project" in place of a page list, and add "ends <d Mon>" when it has an end.

**Wire contract.** A share request gains `whole: true` (with no `pages`) and `ends` (`"never" | "30d" | "7d"`); the Worker sets the end from its own clock. A share as members see it gains `whole` and `endsAt` (seconds, absent for none); for a whole-project share its `pages` still lists every page as it now stands, so an older spool's rows read sensibly. The daemon passes both through unchanged for team projects.

**The outsider's canvas.** Unchanged in shape: a whole-project share's canvas is the shared canvas of every page. Its foot line says "<name> shared <project> with you". A page or frame the outsider hasn't seen since this browser last opened the share wears today's unseen mark in their rail until visited; the first open marks nothing. It is kept in the browser alone, since a link share's outsider may be no account at all.

**The stopped and ended answer.** A share's address answers, once it has stopped, with an empty state drawn from the design system: "<name> stopped sharing <project>" or "This share ended on <d Mon>", then "Ask <maker's name> if you need it again." On a link share's host anyone holding the link gets it. On a people share's page only an account its people still name gets it; anyone else gets today's "This page isn't here". A member is still sent to the team's canvas, and a lapsed team's share still says "This share has stopped". The name is the stopper's, or the team's once that account is gone, as a share's maker is today.

**Invite email.** A whole-project share's email says "<name> shared <project> with you on spool", without a page count.

**Solo projects.** A solo project's whole-project share makes its daemon upload what every page is made of, by the same rule it uploads shared pages by today, still inside the 1 GB fair-use limit; pages added later go up with its next upload after a turn or a quiet spell.

**Glossary.** spool-cloud's **Share** entry changes from "some of a project's pages" to "some of a project's pages, or the whole project: every page, and pages added later", and gains its end ("it may end by itself on a day chosen when it is made"). **Settled** and **Compile object** gain that a whole-project share's pages are resolved from the compile object's own copy.

## Testing Decisions

- Test only what an outsider or member can observe through the outermost seam: HTTP answers, served frames and canvases, emails sent, the popover's DOM. Never the tables or the compile object's internals.
- spool-cloud: the Worker's share routes and outsider addresses, driven end to end with the compile and sync objects in workerd, as `shares.worker.test.ts` and `outsider-comments.worker.test.ts` do: make a whole-project share, save a new page, let it settle, and read the outsider's canvas and frame; end a share by advancing the injected clock and calling the scheduled entry, as the billing sweep tests (`billing/endings.worker.test.ts`) do.
- spool: the Share popover in a browser against a fake shares source, as `share-control-browser.test.ts` does; the outsider's canvas, its rail marks and the ended state, as `viewer-outsider-browser.test.ts` does; the solo upload through the daemon's share routes with a fake cloud, as `daemon/shares.test.ts` does.
- The predicate *what a share shows* gets a small unit test beside today's page tests (`share-pages.test.ts` is prior art on the spool side).

## Out of Scope

- Turning a pages share into a whole-project one or back; stop it and share again.
- Any end other than Never, 30 or 7 days, and telling anyone when a share ends.
- Making or ending shares from the browser: the browser's Shared control stays read, change people, stop.
- A live outsider canvas: a page added later appears on their next load of the share, as every settle does today.
- Outsiders seeing presence, or being seen: unchanged.
- The design-system bundling and re-settle on `shared/` saves: they ship (see Further Notes).

## Further Notes

Build tickets: #182 (whole project), #183 (ends and the stopped/ended answer), #184 (unseen for outsiders), #185 (solo projects); the last three are blocked by #182.

Audit of #102's decisions against main in both repos (2026-10-21):

- **Who (Named people / Anyone with the link)**: shipped. spool-cloud `src/worker/shares/model.ts`, `access.ts`; spool `src/ui/share-control.tsx` (`NewShare`).
- **Two ways in**: partial. Page right-click Share… opens the bar's Share popover on that page (spool `src/ui/canvas/canvas.tsx` `onSharePage` → `openShare`). The "share sheet" #102 drew on was replaced on 2026-10-15 by the bar's Share popover (`768fbd74`); the Shared control with its popover is only in the browser viewer (`src/ui/shares.tsx`, `src/ui/viewer/viewer.tsx` `ProjectShared`) and can't make shares. No Share the whole project… item.
- **What: Whole project**: missing. Shares are a page list, 1–100 (`migrations/auth/0013_shares.sql`, `sharePages`); every check is `pages.includes(pageOf(frame))` (`access.ts` `shows`, `link.ts` `opensAt`, `frames/object.ts` `settlePages`, `sync/object.ts` outsider pages fixed at connect).
- **Pages added later settle in**: missing. The compile object is told shares only when one changes (`shares/told.ts`, `frames/settled.ts` `setShared`).
- **Ends and the sweep**: missing. No `ends_at`; the 5-minute cron runs billing and purge jobs only (`src/worker/index.ts` `scheduled`).
- **Outsider sees the read-only canvas, each page as settled, no presence**: shipped (`shares/viewer.ts`, `frames/settled.ts` `sharedCanvas`, spool `src/ui/viewer/viewer.tsx`). Its foot line lists pages (`SharedLine`).
- **New page marked unseen for the outsider**: missing. Unseen marks come only from members' live socket (`viewer.tsx` `LiveCanvas`); outsiders re-read hourly.
- **Phone gets the shared-link player**: shipped (`src/ui/viewer/shared-link.tsx`, #79, awaiting Liam's iPhone check only).
- **Stop sharing, at once**: shipped (`model.ts` `stopShare`, `shares.tsx`, `share-control.tsx` `ShareDetail`).
- **Rows say "whole project" / "ends 9 Nov"**: missing.
- **Stopped / ended empty state with whom to ask**: missing. Stopped answers "This page isn't here" (`shares/app.ts` `createSharePagesApp`) or "This link doesn't open anything any more" (`link.ts`); a lapsed team's says "This share has stopped".
- **Frames bundle every `shared/` file they import**: shipped (core compile in `frames/compile.ts`; #34).
- **A `shared/` save re-settles the pages that render it**: shipped (`frames/object.ts` `saved()` with `savedFrames` `touched`).
- **Design-system pages in a whole share**: follows from Whole project; nothing extra.

## Open questions

1. **Where the second door lives.** #102 drew a dialog and put *Share the whole project…* at the foot of the Shared control's popover; since then sharing moved to the bar's Share popover, and the Mac has no Shared control (the browser's can't make shares). *Recommendation:* as specced, the What choice in the Share popover, plus *Share the whole project…* at the foot of that popover's list of shares; no door in the browser.
2. **Naming the maker's email in the ended state.** The prototype says "Ask ana@tidemark.io"; the glossary's **Name** shows an address only to the person and their team's People page. *Recommendation:* name only ("Ask Ana if you need it again."), as specced; an email address on a public link's dead page is a harvestable address.
3. **What unseen is measured against for an outsider.** A link share's outsider may be no account. *Recommendation:* per browser, since that browser last opened the share, first open marks nothing, as specced.
4. **Whole project for solo projects.** #102 was about teams; solo shares exist and the daemon uploads only shared pages. *Recommendation:* yes, the same share, in its own droppable ticket (#185).
5. **Changing a share's end after making it.** Not drawn. *Recommendation:* not at launch; stop and share again (for a link share that means a new link, which is acceptable for a 7- or 30-day review).

*From Linear DEV-266.*

Related: #102, #89

Plane: SPOOL-115

## Comments

### agent, 2026-10-21T16:50:08.028Z

Spec and build tickets written (agent-hub task 205). The body is now the spec, with an audit of what already ships in Further Notes and five open questions for Liam at its end. Build tickets, blockers first: #182 Sharing: share the whole project, pages added later included; #183 Sharing: a share ends on its date, and its address says it stopped or ended (blocked by #182); #184 Sharing: an outsider sees pages added later marked unseen (blocked by #182); #185 Sharing: a solo project shares its whole project (blocked by #182, drop it if open question 4 goes the other way).

### agent, 2026-10-21T19:14:02.223Z

All children closed (#182, #183, #184, #185), merged in spool 863def92 and spool-cloud de0703a. Open questions taken as recommended. Reaching users needs a spool.page core release (the release PR) and a spool-cloud pin bump to it plus a deploy with migrations 0036 and 0037 applied; design/frames/app/ mirrors of the Share popover and Shared control are left for the canvas.
