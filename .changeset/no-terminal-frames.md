---
"spool.page": minor
---

Breaking: terminal frames are gone. `term.tsx` is no longer a frame entry, `spool/term` no longer resolves, and the map no longer reads `term.go` sites; a folder holding only a `term.tsx` now reads as a page. Execution had been disabled since the isolation boundary, and four terminal frames were ever written across every project the canvas has been used on. Frames have one kind, `frame.tsx`, and the xterm runtime, the terminal font, and the session store leave the package with it.
