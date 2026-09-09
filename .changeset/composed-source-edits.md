---
"spool.page": patch
---

Fixed text and property edits being refused inside nested component children and panels passed through layout components. These edits now save, update shared uses and support Undo and Redo. Shared-source checks reuse parsed source so complex frames stay responsive while preserving complete checks, including previously absent attributes and uses whose coverage is uncertain.
