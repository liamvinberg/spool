---
"spool.page": minor
---

A frame that does not state a size now starts at 1440×900 instead of 390×844. Most frames are pages, and a phone is a shape you pick on purpose: write `{ "w": 390, "h": 844 }` in frame.json for one. Frames whose size is already on disk are untouched, and `spool shot` narrates the new default when it falls back to it.
