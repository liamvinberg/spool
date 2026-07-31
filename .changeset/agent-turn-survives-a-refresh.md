---
"spool.page": minor
---

Refreshing the page no longer kills the agent. A turn belongs to the daemon now, not to the browser tab reading it, so a reload, a closed lid or a few seconds of dropped wifi leaves it working. When the canvas comes back it goes and finds the turn still running in that thread, replays what it missed, and carries on from there. The work in flight is not lost and nothing is drawn twice.

Two things stop a turn, and both are a hand: the stop under the composer, and closing the thread it belongs to.

A turn that finished while you were away is kept readable for five minutes, so you come back to how it actually ended instead of a thread marked stopped.

Messages you queued while the agent was working are kept with the thread, so a refresh no longer drops them. And when a stream really does die, the rail says what happened instead of the same six words for every cause.
