---
"spool.page": patch
---

Fixed text and property edits being refused inside nested component children and panels passed through layout components. These edits now save, update shared uses and support Undo and Redo. Unrelated elements no longer stall shared-source checks and cause edits to time out in complex frames. Adding a previously absent attribute still reaches every affected use.
