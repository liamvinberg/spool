# #155 · Wayfinder map: comments on Spool Cloud

- State: open
- Labels: wayfinder:map
- Created: 2026-10-18T17:43:56.937Z
- Updated: 2026-10-19T19:46:43.922Z

## Destination

A spec for comments on Spool Cloud team projects, ready to turn into build tickets: who comments, where comments live, what they pin to, how leaving and reading them feels in the Mac app and the browser, and how agents read and act on them. The map is done when nothing is left to decide before writing that spec. Planning only: research, prototypes and decisions, no building.

## Notes

- Builds on Idea: comments on shared pages, from members and outsiders (#50) and Decide whether outsiders can comment, and where comments live (#39) (parked 2026-10-04), and the evidence in `spool-cloud/research/109-presence-locks-feedback/` (how Figma, Vercel, Chromatic, BugHerd, Marker.io, Loom and Notion pin comments and who may comment) and `105-collaboration-competitors/`.
- Scope set with Cata on 2026-10-17 (agent-hub task 165): members of every role (admin, editor, viewer) and outsiders on a share can comment. Agents are in scope: reading comments, acting on them, answering. Only team projects have comments.
- Two canvases show a team project: the Mac app canvas (editors; panes in sides, the canvas tools Select, Edit and Hand at the bottom) and the browser canvas at spool.page (`src/ui/viewer/`; viewers, outsiders and members in a browser), which has only a pages rail, no panes and no tools. Comments must work in both.
- Naming: **Thread** already means an agent conversation in GLOSSARY.md, so a comment and its replies need another word. Settle it with domain-modeling when the prototype names it.
- Cata isn't a designer and expects something close to Figma: bring variations and a recommendation, and research how others make it feel before prototyping.
- Research lands in `spool-cloud/research/` as folders named `spool-<N>-<slug>` (ticket numbers collide with the Linear-era folder numbers). Prototypes are spool frames in the spool repo's `design/` (team project, run `pnpm -s dev skill` first), under `design/frames/explore/cloud/`.
- Skills: grilling and domain-modeling for decisions; research for research; prototype and the designer agent for prototypes. Everything stays in agent-hub's tracker (project spool, shown in Desk), never public GitHub.

## Decisions so far

- Research: how Figma and similar tools make commenting feel (#156): nearly every canvas tool enters commenting with C and hides pins with Shift+C (both free in Spool), pins are about 32 px, and link guests mostly sign in or give a name and a verified email. Findings in `spool-cloud` `research/spool-156-commenting-feel/` on branch `165-next-thing-i-think-is-really--wayfinder-165-research-165-commenting-feel`.
- Research: comments as synced files in design/ vs stored in Spool Cloud (#157): as files, every comment is an ordinary editor save against the shared 120 a minute bucket, never pruned, with no way in for viewers or outsiders; Cloud storage fits outsiders but loses offline use and plain file reads for agents. Findings in `spool-cloud` `research/spool-157-comments-storage/` on branch `165-next-thing-i-think-is-really--wayfinder-165-research-165-comments-storage`.
- [Decide where comments live (#161)](https://devobee.tail9e5223.ts.net/spool/tickets/161): in Spool Cloud, as a table in each project's sync DO outside the save path (no bucket, no history, live over existing sockets); the Mac is read-only offline; how agents reach them is #164's. [ADR 0011](https://github.com/liamvinberg/spool/blob/main/docs/adr/0011-comments-live-in-spool-cloud-not-in-design.md).
- [Decide who can comment and who sees whose comments (#158)](https://devobee.tail9e5223.ts.net/spool/tickets/158): every role and outsiders comment; each share is its own conversation (outsiders see only their share's comments, the composer picks Team or a share, replies follow), link visitors sign in to comment as Figma asks, and a commenter is seen on their comments and in the share's list, never in presence.
- [Decide what a comment is pinned to (#160)](https://devobee.tail9e5223.ts.net/spool/tickets/160): a point on a frame in the frame's pixels (or on a page's empty field, never a page object), carrying the element's handles as context but never following it. Comments are made on the canvas only and remember the source revision and its still. Pins follow moves and Spool's renames, keep their pixel offset on resize, stay put and say "edited since" on edits, and drop onto the page when their frame is deleted.
- Decide how people get a display name (#159): a required name step after the first email-code sign-in, prefilled from the address with a live pointer preview as in Figma; Google's name taken without asking; the name alone shown everywhere (the email only on People and your own account); renames apply everywhere; no photos; without a name, the address before the @. Added **Name** to spool-cloud's glossary.
- [Decide how agents read, act on and answer comments (#164)](https://devobee.tail9e5223.ts.net/spool/tickets/164): one verb, `spool comments`, reads them from the daemon and is the one verb that writes; "Send to agent" puts a comment in the composer as a chip; the agent gets a `<comment>` block; it replies and resolves Team comments as "Ana's agent" but only drafts on a share's; it may start Team comments when asked; a comment never starts an agent. ADR-0005 amended.

## Not yet specified

- **Notifications**: how people learn about new comments and replies (in the app, Home, email, mentions), and who gets told. Comments sit per project in the sync DO, so finding someone's comments across projects may need a D1 index (#161).
- **Comments over time**: what happens to comments on a restore from history, when a frame or page is deleted, when a project leaves the team, when a team goes local for not paying, and when an account is deleted.
- **Limits and abuse**: link visitors may comment once signed in (#158), so how spam is held back, and who may resolve, edit or delete someone else's comment (Figma: anyone who can comment resolves, authors edit their own, owners and editors delete any).

## Out of scope

- **Phones**: the phone navigator and player show no comments in this effort. Cata: clients rarely look at shared frames that way.
- **Projects that aren't team projects**: comments exist only on Spool Cloud.
- **Emoji reactions**: an agent can't act on an emoji (#50).
- **Building**: the spec and its build tickets are the handoff after this map.

Plane: SPOOL-155
