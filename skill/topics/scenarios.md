---
summary: named seeds: { state }
---

shared/scenarios/<name>.json = { "state": { ... } } — one named way the app can be. state seeds ui.state at session start. The key is optional; no default.json means an empty seed. Names are file names: no leading dot, no slashes.

default.json is what loads when nothing else is named or resumed: canvas plays, shot/logs boots. The player URL takes ?scenario=<name>; a frame document's URL takes the same query, and naming a different scenario restarts the session. Reloading the tab re-reads the file, so an edited seed lands without a new URL.

Frames never branch on which scenario is loaded — no scenario name in ui.state, no "if demo". A scenario is felt through what it seeds: empty is an empty list in state, an error is a flag in state that the frame renders. If a frame needs a flag, that flag is state.

Spool runs no backend for a frame: its fetch reaches the real network, and only over https (topic: frames). What the app knows lives in ui.state, seeded by the scenario and written by the frame; a request the prototype only pretends to make is an optimistic ui.state update and nothing else.

A scenario file that is missing or broken never blanks the frame: it plays with an empty seed and the error lands in the frame's console — `spool logs` shows it.
