---
"spool.page": patch
---

The skill no longer promises a session that a bare frame document cannot keep. `spool skill flows` now scopes session continuity to the canvas and the player, and `spool skill verbs` says what `spool url --raw` is for and what it costs. The raw document is sandboxed onto its own origin, so it has no storage: a reload starts over, a walk out of it starts the next frame from the scenario with the state left behind, and a walk to a name no frame answers lands on the daemon's 404 instead of staying put. It also names the CORS error every raw walk logs, so nobody reads that as a dropped walk again. Drive the player for anything that walks or carries state.
