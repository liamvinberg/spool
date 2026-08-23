---
"spool.page": minor
---

Spool now has a Mac app. Download the DMG from the release page, drag it to Applications, and click Open Canvas in the menu bar. It brings its own Node and its own copy of spool, so nothing else has to be installed to get a canvas open.

It starts the daemon, or adopts the one you already have running, so the CLI keeps working against exactly the same daemon. Quitting the app stops a daemon it started and leaves one it adopted alone. If you use the app you do not also need `spool autostart`.
