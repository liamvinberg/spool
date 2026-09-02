---
"spool.page": patch
---

A development lane is now its own app rather than a second launch of the daily one. `SPOOL_DIR` gives the Mac app its own Electron state directory, and with it its own single-instance lock: a checkout's window used to ask for the lock the installed Spool was holding, be refused, and raise that app's canvas instead of opening its own. It also says which it is — "Spool Dev" in the Dock, the menu bar and the About panel, and the development blue on the app icon, the menu bar mark and the ribbon mark on the canvas, beside the favicon that already wore it. The mark alone: the accent stays as it was.
