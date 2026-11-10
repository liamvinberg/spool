---
"spool.page": minor
---

**Decks, as an experiment.** Turn on `spool experiments on deck` and a page holding a `deck.json` becomes a talk: spool lays its slides out in a row, in the order the file lists them, and keeps the other frames on the page in a grid below. A slide can reveal itself in steps with `ui.beats(["title", "price"])` and say it holds something to use while presenting with `ui.live()`, both on the `spool` import. Until a talk can be played, a slide always shows its last step, so it looks complete everywhere. Each slide can keep the presenter's words in a `notes.md` beside it, one paragraph per step. `spool check` points out a deck that names a missing slide, steps that are not written out as a list, and a slide that imports its notes. `spool skill deck` teaches an agent how to write one.
