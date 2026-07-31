---
"spool.page": minor
---

There is now an address you can remember. Open local.spool.page in any browser and it finds spool running on your own machine and takes you straight to it. If nothing is running yet it tells you how to start it, and it keeps listening, so the canvas opens by itself the moment you do.

Nothing you work on goes anywhere near that page. It only asks your machine whether spool is answering, and once it is, everything is back on your own computer where it was.

`spool open` and `spool serve` now print the address under the real one. The real one stays first, because that is the truth and the one your agent uses. If your daemon is on a different port, the printed address carries it.

The daemon tells that page two things about itself, its name and its version, and only that page and pages served from your own machine can ask. Nothing else about spool became readable from a browser tab.
