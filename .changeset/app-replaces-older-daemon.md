---
"spool.page": patch
---

The Mac app no longer adopts a daemon that is behind it. The daemon is what draws the canvas, so an app that had just updated was showing the older Spool whenever the cli had started the daemon first. Now a daemon behind the bundle is stopped on launch and the bundled one takes its place, the way `spool upgrade` does it from the terminal. Equal versions are adopted as before, and a newer daemon is never downgraded.
