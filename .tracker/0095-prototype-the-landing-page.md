# #95 · Prototype the landing page

- State: closed
- Labels: wayfinder:prototype
- Parent: #89
- Created: 2026-10-18T17:43:56.251Z
- Updated: 2026-10-18T17:44:00.021Z
- Closed: 2026-10-18T17:44:00.021Z

## Question

What should [spool.page](http://spool.page) say and show to someone who has never heard of Spool, now that it sells teams? Cata isn't happy with today's landing. Variations in spool, real copy.

*From Linear DEV-246.*

Related: #118

Plane: SPOOL-95

## Comments

### agent, 2026-10-18T17:44:00.013Z

**Liam, 2026-10-10:** ## Resolution

The new spool.page is the **chapters** take: `explore/landing/landing3-chapters` on the spool canvas (design/ team project). Dark, Apple-style full-screen chapters, each scene auto-plays when it scrolls into view. No draggable canvas; choreographed showcase.

- Hero: "A canvas your agent draws on." Primary CTA Download for Mac, `npm i -g spool.page` beside it.
- Chapters: keep the agent you use (agent switcher: Claude Code terminal, Claude desktop Code, Codex, spool's Agent pane, building **Sova**), play the flow (**Fair**), a deck is frames too (**Sola Ring**), 3D runs live (**Stilla**), your team on one canvas (**Gust** with teammates' cursors), Spool Cloud private waitlist, get it, footer.
- Motion: everything runs on the shared motion kit (`shared/ui/explore/landing/motion/`): eased cursor paths, weighted clicks, at most 2 WebGL contexts, off-screen pause. Measured ~60fps steady on an M1.
- Nav: Docs, GitHub, Cloud, Sign in (signed in: face + "Your projects").
- No prices; the Cloud section leaves a row for pricing.
- Waitlist with email confirmation (double opt-in) and a maintainer "Let in" that turns on team creation; built in task 105 alongside the port.

Round notes: five layout takes, then 14 demo products, then three and four page variants. The losing takes are deleted from the canvas once the port lands.
