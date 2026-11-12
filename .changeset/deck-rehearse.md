---
"spool.page": minor
---

**Rehearse a talk.** `spool rehearse <talk>` plays a deck in the stage the room sees, from its first beat to its last and back, in spool's headless browser, and says at each slide and beat what broke, what moved wrong and what lagged: a slide that threw or was still loading, a move between slides that did not run and which elements caused it, a picture that came late, words cut by the slide's edge, a beat that moves the layout, and too many WebGL contexts. It writes a sheet of every beat and every move between slides to look at, exits 1 only for what breaks the talk, and rehearses one slide or a range with `--slides`.
