# #155 · Wayfinder map: comments on Spool Cloud

- State: open
- Labels: wayfinder:map
- Created: 2026-10-18T17:43:56.937Z
- Updated: 2026-10-18T17:58:01.609Z

## Destination

A spec for comments on Spool Cloud team projects, ready to turn into build tickets: who comments, where comments live, what they pin to, how leaving and reading them feels in the Mac app and the browser, and how agents read and act on them. The map is done when nothing is left to decide before writing that spec. Planning only: research, prototypes and decisions, no building.

## Notes

- Builds on Idea: comments on shared pages, from members and outsiders (#50) and Decide whether outsiders can comment, and where comments live (#39) (parked 2026-10-04), and the evidence in `spool-cloud/research/109-presence-locks-feedback/` (how Figma, Vercel, Chromatic, BugHerd, Marker.io, Loom and Notion pin comments and who may comment) and `105-collaboration-competitors/`.
- Scope set with Cata on 2026-10-17 (agent-hub task 165): members of every role (admin, editor, viewer) and outsiders on a share can comment. Agents are in scope: reading comments, acting on them, answering. Only team projects have comments.
- Two canvases show a team project: the Mac app canvas (editors; panes in sides, the canvas tools Select, Edit and Hand at the bottom) and the browser canvas at spool.page (`src/ui/viewer/`; viewers, outsiders and members in a browser), which has only a pages rail, no panes and no tools. Comments must work in both.
- Today presence shows a person's email, not a name. Cata wants names: a name step when you sign up unless Google gives one.
- Naming: **Thread** already means an agent conversation in GLOSSARY.md, so a comment and its replies need another word. Settle it with domain-modeling when the prototype names it.
- Cata isn't a designer and expects something close to Figma: bring variations and a recommendation, and research how others make it feel before prototyping.
- Research lands in `spool-cloud/research/` as folders named `spool-<N>-<slug>` (ticket numbers collide with the Linear-era folder numbers). Prototypes are spool frames in the spool repo's `design/` (team project, run `pnpm -s dev skill` first), under `design/frames/explore/cloud/`.
- Skills: grilling and domain-modeling for decisions; research for research; prototype and the designer agent for prototypes. Everything stays in agent-hub's tracker (project spool, shown in Desk), never public GitHub.

## Decisions so far

- Research: how Figma and similar tools make commenting feel (#156): nearly every canvas tool enters commenting with C and hides pins with Shift+C (both free in Spool), pins are about 32 px, and link guests mostly sign in or give a name and a verified email. Findings in `spool-cloud` `research/spool-156-commenting-feel/` on branch `165-next-thing-i-think-is-really--wayfinder-165-research-165-commenting-feel`.
- Research: comments as synced files in design/ vs stored in Spool Cloud (#157): as files, every comment is an ordinary editor save against the shared 120 a minute bucket, never pruned, with no way in for viewers or outsiders; Cloud storage fits outsiders but loses offline use and plain file reads for agents. Findings in `spool-cloud` `research/spool-157-comments-storage/` on branch `165-next-thing-i-think-is-really--wayfinder-165-research-165-comments-storage`.
- [Decide where comments live (#161)](https://devobee.tail9e5223.ts.net/spool/tickets/161): in Spool Cloud, as a table in each project's sync DO outside the save path (no bucket, no history, live over existing sockets); the Mac is read-only offline; how agents reach them is #164's. [ADR 0011](https://github.com/liamvinberg/spool/blob/main/docs/adr/0011-comments-live-in-spool-cloud-not-in-design.md).

## Not yet specified

- **Notifications**: how people learn about new comments and replies (in the app, Home, email, mentions), and who gets told. Comments sit per project in the sync DO, so finding someone's comments across projects may need a D1 index (#161).
- **Comments over time**: what happens to comments on a restore from history, when a frame or page is deleted, when a project leaves the team, when a team goes local for not paying, and when an account is deleted.
- **Limits and abuse**: if people with only a link may comment, how spam is held back.

## Out of scope

- **Phones**: the phone navigator and player show no comments in this effort. Cata: clients rarely look at shared frames that way.
- **Projects that aren't team projects**: comments exist only on Spool Cloud.
- **Emoji reactions**: an agent can't act on an emoji (#50).
- **Building**: the spec and its build tickets are the handoff after this map.

Plane: SPOOL-155
