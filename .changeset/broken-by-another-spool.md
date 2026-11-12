---
"spool.page": patch
---

A frame no longer shows as broken on the canvas because an older Spool on the same Mac failed to run it. When Spool and Spool Beta, or an app not yet restarted into its update, both have a project open, each now marks only the frames it failed on itself. `spool check` and `spool logs` do the same. A frame that uses something an older Spool lacks now says that Spool is older than the canvas needs, instead of an error like "ui.beats is not a function".
