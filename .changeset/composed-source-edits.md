---
"spool.page": patch
---

Fixed text and property edits being refused inside nested component children and panels passed through layout components. These edits now save, update shared uses and support Undo and Redo. Shared-source checks reuse parsed source and leave time for frame replies so large canvases do not expire otherwise valid edits. Complete coverage checks, including previously absent attributes and uncertain uses, are preserved.
