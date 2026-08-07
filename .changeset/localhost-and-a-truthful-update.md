---
"spool.page": patch
---

Typing `localhost:7766` now opens spool. It used to answer "unexpected host" because the daemon only recognized the name it was bound under, so the other name for your own machine was turned away. It sends you to the bound address instead. A name that is not this machine is still refused.

The update toast now tells you how the update is going and always ends. Pressing Update used to say "Updating…" and could sit there forever: an upgraded daemon issues a new key, and an open canvas had no way to be given it, so the page never came back and never said why. It now reloads onto the new version by itself, says whether it is installing or restarting while it waits, and says so plainly when an update did not land instead of leaving you guessing. A canvas left open through any daemon restart now comes back the same way, rather than looking fine while nothing reaches it.
