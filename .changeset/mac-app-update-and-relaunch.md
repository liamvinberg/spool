---
"spool.page": patch
---

Update and Relaunch in the Mac app now installs the update. It downloaded the new version and then relaunched into the old one, because the download never reached the part of macOS that swaps the bundle. While it downloads, the Dock icon fills and the menu bar item counts the percent, so a 160 MB download no longer looks like a button that did nothing. If the swap does not happen, Spool says so, opens the release page, and puts its daemon back rather than sitting on a stopped window.
