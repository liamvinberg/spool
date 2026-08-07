---
"spool.page": minor
---

Running `spool` with nothing after it takes you to your canvas. It finds the project you are standing in, registers it, starts the daemon if one is not already running, and prints the canvas address. Before, a bare `spool` printed the list of commands, and reaching a visible canvas took `spool open`, then `spool serve`, then retyping a URL you had to remember.

Nothing else moved. `spool open` still registers a project without starting anything, a bare `spool` outside a project still points you at `spool init` rather than scaffolding one, and a misspelled verb is still an unknown command rather than a canvas.
