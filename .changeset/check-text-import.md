---
"spool.page": patch
---

`spool check` no longer reports a `.txt` import as a missing module: the compiler has always served the file's text, and the checker now types it as the string a frame receives.
