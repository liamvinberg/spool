---
"spool.page": patch
---

A `ui.state` write from inside a component body used to fail in silence: the write makes React run that render again, so the value the render just read was gone. The one that cost real time was a one-shot flag handed over by a walk, read and cleared in the same render, which left the next frame looking like it had arrived fresh. The runtime now warns in the frame's console when a render replaces or deletes a state key, once per site, naming the key and where it happened. Seeding a key that was not there yet (`ui.state.items ??= []`) stays quiet, because it is idempotent. The `spool skill flows` topic says the rule: writes belong in handlers and effects, and a one-shot flag is read in render and cleared in an effect.
