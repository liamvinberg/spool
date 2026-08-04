---
"spool.page": patch
---

Spool only offers an update when it can actually install one. Running from a git checkout, or any install no package manager owns, no longer shows the update toast and no longer asks npm daily whether a newer release exists. The Update button there could only ever fail, because that kind of install updates with `git pull`.
