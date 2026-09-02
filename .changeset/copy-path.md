---
"spool.page": patch
---

Right-clicking a frame now offers Copy path instead of Open in editor. It puts the frame's source path on the clipboard, ready to hand to an agent or paste into a terminal, and a line says which path it copied. Right-clicking an element inside a frame copies the file that element actually comes from, which is often a shared component rather than the frame. Open in editor is gone: it tried to guess your editor and mostly failed, and spool has no business choosing one.
