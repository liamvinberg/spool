---
"spool.page": minor
---

The Mac app is now a real app. It opens a window with your canvas in it instead of a menu bar item that sends you to a browser tab.

Closing the window leaves the app running in the menu bar, with your daemon still up, so the window comes back the moment you click the icon again. Quitting is the one that ends things: it stops the daemon if the app started it, and leaves it alone if you had one running already.

The DMG is about twice the size it was, because the app now carries the browser engine the canvas is drawn with.
