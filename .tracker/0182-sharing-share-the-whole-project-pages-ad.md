# #182 · Sharing: share the whole project, pages added later included

- State: closed
- Labels: ready-for-agent
- Parent: #115
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:50:03.410Z
- Updated: 2026-10-21T19:14:02.189Z
- Closed: 2026-10-21T19:14:02.189Z

## Parent

Spec: sharing a whole project (#115)

## What to build

The tracer for a whole-project share on a team project, end to end. In the bar's Share popover an editor picks **What**: *Pages* (today's tree) or *Whole project* ("Every page, and pages added later", no tree). A page's right-click Share… opens on Pages with that page, as today; *Share the whole project…* at the foot of the popover's list of shares opens on Whole project. The share is stored as "every page", not a list, with no 100-page cap, and works for Named people and Anyone with the link, with Start on the held frame as today. One predicate, *what a share shows*, replaces every `pages.includes(pageOf(frame))` check (frames, covers, scenarios, link host paths, comments). The compile object resolves a whole-project share against its own copy as it catches up: a page that appears settles and joins the share; one that goes leaves it. The outsider's read-only canvas shows every page in its rail, design-system pages included; its foot line says "<name> shared <project> with you". Their comments socket hears and posts on every page. The invite email says the whole project. Members' rows (Mac Share popover and browser Shared control) say "whole project"; a member's share view carries `whole` and still lists every current page in `pages` for older spools. Glossary: spool-cloud's Share entry.

Spans spool-cloud (model, migration, access, compile object, sync object outsider pages, invite email, glossary) and spool (Share popover, share view types, daemon pass-through, Shared control rows, viewer foot line).

## Acceptance criteria

- [ ] An editor makes a whole-project link share and a whole-project people share from the Share popover; the page tree shows only under Pages
- [ ] Share the whole project… at the foot of the popover's share list opens the new share on Whole project; a page's right-click still opens on Pages with that page
- [ ] A worker test: a whole-project share of a 120-page project is accepted; an outsider is served a frame on any page, the canvas lists every page, and nothing outside the project
- [ ] A worker test: a page saved into the project after sharing settles and appears in the outsider's canvas; a page deleted leaves it
- [ ] A worker test: a save to a `shared/` file re-settles the whole share's pages that render it (regression guard on what ships)
- [ ] An outsider on a whole-project team share comments on any page; a pages share's outsider still can't post off its pages
- [ ] The invite email of a whole-project people share names the project without a page count
- [ ] Shared control rows and the Mac share detail say "whole project"; an older spool's rows read the current page list
- [ ] spool-cloud GLOSSARY.md's Share entry says some pages or the whole project
- [ ] A changeset for spool's published behaviour

## Blocked by

None (can start immediately).

## Comments

### agent, 2026-10-21T19:14:02.189Z

Built and merged: spool 863def92 (merge 205 #115), spool-cloud de0703a. Cloud: migration 0036_share_whole (shares gains whole; pages '[]' for whole, no 100 cap), one predicate showsPage/showsFrame (frames/settled.ts) behind frames, covers, scenarios, link host paths and comments; the compile object resolves a whole share's pages from its own copy (a new page's saves wait and settle at its writer's turn end or a quiet spell; a deleted page leaves at its settle); comments sockets resolve pages from the sync object's copy (no core change); email says "<name> shared <project> with you on spool"; members' view carries whole with every current page in pages; glossary. Spool: What choice (Pages / Whole project) in the Share popover, "Share the whole project…" at the foot of its list of shares, rows and detail say "whole project", viewer foot line "<name> shared <project> with you", changeset. Spec recommendation taken: the whole-project door lives in the bar's Share popover; none in the browser. Human step: design/frames/app/ spool-canvas--share, --share-picking and --shared need the What choice, the foot item and "whole project" rows mirrored.
