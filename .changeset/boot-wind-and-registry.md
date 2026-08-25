---
"spool.page": minor
---

The canvas no longer waits on the project registry before it draws. Opening a project used to block on a scan of every registered project's design folder, which grows with every project you add and is paid on every open. Now only the session gates the canvas, and the registry lands behind it.

The loader over the remaining wait is the mark winding on and off. A fast open still shows nothing at all, because there is nothing to wait for.
