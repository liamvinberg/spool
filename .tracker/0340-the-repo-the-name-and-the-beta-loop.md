# #340 · The repo, the name and the beta loop

- State: closed
- Labels: wayfinder:grilling
- Parent: #333
- Created: 2026-11-13T14:47:11.024Z
- Updated: 2026-11-13T15:08:03.245Z
- Closed: 2026-11-13T15:08:03.245Z

## Question

Where does the new spool live while it grows, and how does it reach Liam's Mac?

Settle: a new repo or a branch of this one (he said either); what the package and the app are called meanwhile, beside Spool and Spool Beta; a beta build of its own from the first usable state, updating itself as Spool Beta does (`desktop/README.md`, `.github/workflows/beta.yml`), on our own CI machines; its own state folder and port so all three run side by side; the canvas the new spool is designed on (today's spool, on the rethink project `spool.page/devosurf/rethink`), and when it starts to be designed in itself; what today's spool gets from now on (fixes only?), and what decides the day the new one replaces it.

Mostly engineering calls to make and report; the names are his.

## Comments

### agent, 2026-11-13T15:08:03.245Z

**Resolved with Liam, 2026-11-13 (task 634).**

- **A new repo and a new project, named spool-next** (Liam: "yeah i think a new repo and project here, spool-next"). The agent-hub project spool-next exists as of today. Its GitHub repo (`liamvinberg/spool-next`, private until he says otherwise) is made the first time a task there writes code worth keeping, which is the first spike's results.
- **Today's spool.** Liam: "i will probably focus on spool-next onward, i think current one is in an okay state". So it takes fixes only, stays his daily tool through Spool Beta, and release PR #433 stays unmerged. No new features are planned on it; threads already open (624, 631, 637, 655, 666) design for spool-next unless he says a piece should land in today's spool.
- **Engineering calls, made by the map:** the app is called Spool Next while it grows, with its own bundle id so it sits beside Spool and Spool Beta; its own state folder (`~/.spool-next`) and its own port (7766, 7767, 7788, 7790 and 7791 are taken on devobee); a beta build of its own from main, on our CI machines, updating itself as Spool Beta does, which is part of the walking skeleton (#351) and not a later step; the map and its tickets stay in spool's tracker until #351 writes the first specs, which go in spool-next's.
- **Designed on today's spool** (the rethink project, `spool.page/devosurf/rethink`) until the new one can open a project and show it; from then on in itself, as he wants ("will probably use spool to build the new version of spool aswell").
- **The day it replaces today's spool** is his call, when he feels it is ready; that is the 1.0.0.
