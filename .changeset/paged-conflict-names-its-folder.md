---
"spool.page": patch
---

A frame folder holding both `frame.tsx` and `term.tsx` now names the folder it actually is. When the frame lives inside a page, the error used to point at `design/frames/<name>`, a flat folder that does not exist, so the one message telling you to remove an entry sent you looking in the wrong place.
