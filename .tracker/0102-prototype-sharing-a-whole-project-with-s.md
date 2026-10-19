# #102 · Prototype sharing a whole project with someone outside the team

- State: closed
- Labels: wayfinder:prototype
- Parent: #89
- Created: 2026-10-18T17:43:56.340Z
- Updated: 2026-10-18T17:44:00.317Z
- Closed: 2026-10-18T17:44:00.317Z

## Question

Today a share is some of a project's pages. Cata wants to share an entire project, read-only, with a client or a developer who isn't in the team. How is it offered beside right-click "share this frame", what does the outsider see (the read-only canvas or the pages), and how does it stop?

*From Linear DEV-253.*

Related: #115

Plane: SPOOL-102

## Comments

### agent, 2026-10-18T17:44:00.308Z

**Liam, 2026-10-11:** ## Resolution

Decided with Cata on 2026-10-11 (agent-hub task 113). He took the recommended take and asked that it hold the design system and look clean.

**Prototype:** the `explore/cloud/share-project` page of the spool canvas at https://spool.page/devosurf/spool. The frames are `share-sheet` and its states `--door`, `--sheet`, `--pages`, `--ends`, `--shared`, `--outsider` and `--ended`, all playable. The code is in `design/shared/ui/explore/cloud-share-project/` and is drawn only from the shipped design system's primitives (Dialog, RadioCard, Checkbox, TextField, SelectTrigger, Menu, Popover, EmptyState). The losing takes were deleted: "pages" (the project shown as pages without the canvas) and "guest" (a live guest on one project).

**How it's offered:** a whole project is one more thing today's share sheet shares, so there is no new surface. The sheet has two ways in:
- a page's right-click *Share…*, as today, which opens on that page
- *Share the whole project…* at the foot of the Shared control's popover, which opens with Whole project picked

The sheet asks three things:
- **Who:** Named people or Anyone with the link, as today.
- **What:** two radio cards. *Pages* shows the page checklist beneath it. *Whole project* reads "Every page, and pages added later" and shows no list.
- **Ends:** a quiet menu in the footer: Never, In 30 days or In 7 days.

**What the outsider sees:** today's read-only canvas in the browser, with every page in its rail, each as it settled. They see no pointers, and nobody sees them. A page added later appears once it settles, marked unseen in the rail. A phone gets today's shared-link player.

**How it stops:** by itself on the end date, if one was set, or at once with *Stop sharing* in the Shared control. The popover row says "whole project", and "ends 9 Nov" under it. The outsider's address then answers with an empty state: "Ana stopped sharing tidemark-app" or "This share ended on 9 Nov", plus "Ask ana@tidemark.io if you need it again."

**Design system and imports (Cata's point):** nothing new is needed for these.
- Each shared frame is compiled by core's own compile, which bundles every `shared/` file it imports (components, tokens.css, fonts, assets) into one document.
- A save to `shared/` marks every shared page whose frames render that file. This is spool-cloud `src/worker/frames/object.ts` `saved()`, which uses `savedFrames` `touched`. So a design-system change reaches the outsider at that page's next settle.
- A whole-project share also includes the project's own design-system pages, because it shares every page.

**For the build:**
- A whole-project share is stored as "every page", not as a list. The Worker must tell the compile object the share's pages again whenever a page appears or goes. Today it does this only when the share changes (`setShared` in `src/worker/frames/settled.ts`).
- An end date is new: the share needs an `ends_at`, a sweep that stops it, and the ended answer on its address.
- The app's `ShareSheet` (`src/ui/canvas/share-sheet.tsx`) gains the What and Ends choices. `SharedControl` gains the foot item.
